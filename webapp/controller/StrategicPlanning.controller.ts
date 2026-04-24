import Controller from "sap/ui/core/mvc/Controller";
import History from "sap/ui/core/routing/History";
import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import GroupHeaderListItem from "sap/m/GroupHeaderListItem";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ListBinding from "sap/ui/model/ListBinding";
import List from "sap/m/List";
import FilterType from "sap/ui/model/FilterType";
import ActionSheet from "sap/m/ActionSheet";
import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Select from "sap/m/Select";
import DatePicker from "sap/m/DatePicker";
import Item from "sap/ui/core/Item";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
// En los imports de arriba, asegúrate de tener al menos el chart principal
import BulletMicroChart from "sap/suite/ui/microchart/BulletMicroChart";
import BusyDialog from "sap/m/BusyDialog";
import BusyIndicator from "sap/ui/core/BusyIndicator"; //
import MessageBox from "sap/m/MessageBox";


declare var google: any;

/***
 * @namespace routeplanningmantto.controller
 */
export default class StrategicPlanning extends Controller {
    private readonly BASE_COORDS = { lat: 19.54471, lng: -99.19305 }; 
    private _oMap: any;
    private _mapAttempts = 0;
    private _oCurrentMarker: any = null;
    private _oDirectionsService: any;
    private _oDirectionsRenderer: any;
    private _baseCoords: any = null;
private _oBaseMarker: any = null;
private readonly LOGO_BASE = "https://tu-servidor.com/path/to/logo_empresa.png";
private _aDirectionsRenderers: any[] = [];
private _aColors = ["#2B6CB0", "#38A169", "#D69E2E", "#E53E3E", "#805AD5", "#319795"];
private _aMarkerColors = ["blue", "green", "red", "orange", "purple", "yellow"];
private _oActionSheet: ActionSheet;
private _pCalendarDialog: Promise<Dialog>;
    

    public onInit(): void {
    const oComponent = this.getOwnerComponent();
    const ooDataModel = oComponent?.getModel("db") as any;

    const oViewModel = new JSONModel({
        isExpanded: false,
        leftColumnWidth: "50%",
        rightColumnWidth: "50%",
        expandIcon: "sap-icon://full-screen",
        expandTooltip: "Ver pantalla completa",
        isCalculating: false,
        isOptimized: false,
    });
    this.getView()?.setModel(oViewModel, "view");

    if (ooDataModel) {
        BusyIndicator.show(0);
        const aFilters = [new Filter("Mail", FilterOperator.EQ, "rmercado@melco.com.mx|032026")];

        ooDataModel.read("/HeaderRouteSet", {
            filters: aFilters,
            urlParameters: { "$expand": "ServicesRouteSet,MechanicRouteSet" },
            success: (oData: any) => {
                if (oData && oData.results && oData.results.length > 0) {
                    const oHeaderData = oData.results[0];
                    const aServicios = oHeaderData.ServicesRouteSet?.results || [];

                    console.log(">>> 1. Datos iniciales de SAP cargados:", aServicios);

                    if (aServicios.length > 0) {
                        MessageToast.show("Geocodificando puntos de entrega...");
                        
                        this._geocodeAllServices(aServicios).then(() => {
                            console.log(">>> 3. Geocodificación finalizada. Datos actualizados:", aServicios);
                            
                            const oDbModel = new JSONModel(oHeaderData);
                            this.getView()?.setModel(oDbModel, "db");
                            this._runRoutingAlgorithm(oDbModel);
                            BusyIndicator.hide();
                        }).catch((oError) => {
                            console.error("Error en geocodificación:", oError);
                            BusyIndicator.hide();
                        });
                    }
                } else {
                    BusyIndicator.hide();
                }
            },
            error: (oError: any) => {
                BusyIndicator.hide();
                console.error("Error al cargar OData:", oError);
            }
        });
    }
}

/**
 * Función auxiliar para completar Latitud y Longitud mediante Google Maps
 */
private async _geocodeAllServices(aServicios: any[]): Promise<void> {
    const oGeocoder = new window.google.maps.Geocoder();
    console.log(">>> 2. Iniciando iteración de geocodificación...");

    for (const oServicio of aServicios) {
        // Verificamos si realmente necesita geocodificación
        if (!oServicio.Lat || oServicio.Lat === "" || oServicio.Lat === "0") {
            const sDireccion = oServicio.DireccionCompleta || oServicio.Direccion;
            
            try {
                const oResult: any = await new Promise((resolve, reject) => {
                    oGeocoder.geocode({ address: sDireccion }, (results: any, status: string) => {
                        if (status === "OK" && results[0]) resolve(results[0].geometry.location);
                        else reject(status);
                    });
                });

                const sOldLat = oServicio.Lat;
                const sOldLng = oServicio.Lng;
                
                oServicio.Lat = oResult.lat().toString();
                oServicio.Lng = oResult.lng().toString();

                console.log(`📍 MODIFICADO - Equipo: ${oServicio.Equipo}`);
                console.log(`   Dirección: ${sDireccion}`);
                console.log(`   Coordenadas: [${sOldLat}, ${sOldLng}] -> [${oServicio.Lat}, ${oServicio.Lng}]`);
            } catch (e) {
                console.warn(`⚠️ No se pudo geocodificar: ${oServicio.Nombre}. Usando coordenadas base.`);
                oServicio.Lat = this.BASE_COORDS.lat.toString();
                oServicio.Lng = this.BASE_COORDS.lng.toString();
            }
        } else {
            console.log(`✅ OMITIDO - ${oServicio.Equipo} ya tiene coordenadas: [${oServicio.Lat}, ${oServicio.Lng}]`);
        }
    }
}


public onAfterRendering(): void {
    // Forzamos un pequeño delay para que el DOM esté 100% listo
    setTimeout(() => {
        this._initMap();
    }, 1000);
}

private _initMap(): void {
    const sMapId = "map_canvas_strategy";
    const mapElement = document.getElementById(sMapId);

    // 1. Validar si el elemento DOM ya existe
    if (!mapElement) {
        if (this._mapAttempts < 15) {
            this._mapAttempts++;
            setTimeout(() => this._initMap(), 400); // Intento rápido
        }
        return;
    }

    // 2. Si la librería de Google ya está disponible
    if (typeof google !== "undefined" && google.maps) {
        try {
            this._oMap = new google.maps.Map(mapElement, {
                center: { lat: this.BASE_COORDS.lat, lng: this.BASE_COORDS.lng },
                zoom: 12,
                mapTypeId: google.maps.MapTypeId.ROADMAP,
                
                // --- CAMBIOS PARA ACTIVAR EL ICONO DE PANTALLA COMPLETA ---
                fullscreenControl: true, 
                fullscreenControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                // Opcionales: habilitamos otros controles útiles
                mapTypeControl: true,
                zoomControl: true,
                streetViewControl: true
            });

            console.log("¡Mapa cargado exitosamente!");
            this.initBaseLocation(); 

        } catch (oError) {
            console.error("Error al instanciar el mapa:", oError);
        }
        return;
    }

    // 3. Carga dinámica de la librería
    if (!document.getElementById("google-maps-sdk")) {
        console.log("Inyectando script de Google Maps...");
        const sApiKey = "AIzaSyDVrf4dOi3krlWgBf0-qjqKXmBLkm-aEEQ"; 
        const oScript = document.createElement("script");
        oScript.id = "google-maps-sdk";
        oScript.src = `https://maps.googleapis.com/maps/api/js?key=${sApiKey}&libraries=places,geometry`;
        oScript.async = true;
        oScript.defer = true;
        oScript.onload = () => this._initMap();
        document.head.appendChild(oScript);
    }

    // 4. Reintento mientras el script termina de cargar
    if (this._mapAttempts < 30) {
        this._mapAttempts++;
        setTimeout(() => this._initMap(), 800);
    }
}



public async initBaseLocation(): Promise<void> {
    const sDireccionBase = "Calle Mariano Escobedo 69, Centro Industrial Tlalnepantla, 54030 Tlalnepantla, Méx., México";
    
    try {
        const oCoords = await this._geocodeAddress(sDireccionBase);
        this._baseCoords = oCoords; 
        this._drawBaseMarker(this._baseCoords);
    } catch (error) {
        console.error("Error al geocodificar, usando respaldo:", error);
        this._baseCoords = { lat: 19.5441, lng: -99.1935 }; // Coordenadas aprox. de Mariano Escobedo 69
        this._drawBaseMarker(this._baseCoords);
    }
}

private _geocodeAddress(address: string): Promise<any> {
    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve, reject) => {
        geocoder.geocode({ address: address }, (results: any, status: any) => {
            if (status === "OK") {
                resolve({
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng()
                });
            } else {
                reject(status);
            }
        });
    });
}



private _drawBaseMarker(coords: any): void {
    if (!this._oMap) return;

    const sLogoUrl = sap.ui.require.toUrl("routeplanningmantto/assets/img/logo.png");

    if (this._oBaseMarker) {
        this._oBaseMarker.setMap(null);
    }

    this._oBaseMarker = new google.maps.Marker({
        position: coords,
        map: this._oMap,
        title: "Base Operativa",
        icon: {
            //url: //sLogoUrl, // Reemplaza por tu logo real
            scaledSize: new google.maps.Size(40, 40),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(20, 20)
        },
        zIndex: 1000 // Asegura que la base siempre esté arriba
    });
    
}



   public onToggleExpand(): void {
    const oViewModel = this.getView()?.getModel("view") as JSONModel;
    const bExpanded = oViewModel.getProperty("/isExpanded");
    const bNewState = !bExpanded;

    oViewModel.setProperty("/isExpanded", bNewState);

    if (bNewState) {
        // MODO PANTALLA COMPLETA
        oViewModel.setProperty("/leftColumnWidth", "0%");
        oViewModel.setProperty("/rightColumnWidth", "100%");
        oViewModel.setProperty("/expandIcon", "sap-icon://collapse-group"); 
    } else {
        // MODO NORMAL (Split)
        oViewModel.setProperty("/leftColumnWidth", "40%");
        oViewModel.setProperty("/rightColumnWidth", "60%");
        oViewModel.setProperty("/expandIcon", "sap-icon://full-screen");
    }

    // CRÍTICO: Avisar a Google Maps que el div cambió de tamaño
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        // Si tienes la instancia del mapa guardada:
        // this._oMap.setCenter(this.BASE_COORDS); 
    }, 400);
}


private _runRoutingAlgorithm(oModel: JSONModel): void {
    const oData = oModel.getData();
    const aServicios = oData.ServicesRouteSet?.results || [];
    const aMecanicos = oData.MechanicRouteSet?.results || [];
    
    const iTargetMonth = 2; // Marzo
    const iTargetYear = 2026;

    console.log(`[LOG-PLAN] --- SIMULACIÓN: FECHA | RUTA-BASE-CONSECUTIVO + KM ---`);

    // --- FASE 1: PREPARACIÓN ---
    aServicios.forEach((s: any) => {
        s.Cliente = s.Nombre; 
        s.Eq = s.Equipo;
        // Limpiamos banderas de ubicación compartida para evitar iconos residuales
        s.isSharedLocation = false;
        s.SharedLocationIcon = "";
        
        if (!s.isManual) {
            if (!s.FechaProgramada) {
                s.FechaProgramada = this._calculateFrequencyDate(s.Frecuencia, iTargetYear, iTargetMonth);
            }
            s.AsignadoA = null;
            s.RutaID = "";
            
            const [day, month, year] = s.FechaProgramada.split('/');
            const oFechaObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            const sNombreDia = oFechaObj.toLocaleDateString('es-MX', { weekday: 'long' });
            s.FechaFull = sNombreDia.charAt(0).toUpperCase() + sNombreDia.slice(1) + ", " + s.FechaProgramada;
        }
    });

    const oResumenRutas: any = {};
    const oCargaGlobalMecanicos: any = {};
    aMecanicos.forEach((m: any) => oCargaGlobalMecanicos[m.Nombre] = 0);

    // --- FASE 3: ASIGNACIÓN AUTOMÁTICA ---
    const oServiciosPorFecha: any = {};
    aServicios.forEach((s: any) => {
        if (!oServiciosPorFecha[s.FechaProgramada]) oServiciosPorFecha[s.FechaProgramada] = [];
        oServiciosPorFecha[s.FechaProgramada].push(s);
    });

    Object.keys(oServiciosPorFecha).sort().forEach(sFecha => {
        const aEquiposDelDia = oServiciosPorFecha[sFecha];
        let bHayEquiposLibres = true;
        let iConsecutivoRuta = 1;

        while (bHayEquiposLibres) {
            const aLibres = aEquiposDelDia.filter((s: any) => !s.AsignadoA && !s.isManual);
            
            if (aLibres.length === 0) {
                bHayEquiposLibres = false; 
                break; 
            }

            const oMecanicoAsignado = aMecanicos
                .filter((m: any) => {
                    const sBusqueda = `${sFecha} | RUTA-${(m.Base || "BASE").replace(/\s/g, "")}`;
                    return !Object.keys(oResumenRutas).some(key => key.startsWith(sBusqueda));
                })
                .sort((a: any, b: any) => oCargaGlobalMecanicos[a.Nombre] - oCargaGlobalMecanicos[b.Nombre])[0];

            if (!oMecanicoAsignado) {
                bHayEquiposLibres = false;
                break;
            }

            const sNombreBase = (oMecanicoAsignado.Base || "BASE").toUpperCase().replace(/\s/g, "");
            
            const oBaseMecanico = {
                lat: parseFloat(oMecanicoAsignado.Lat || this.BASE_COORDS.lat),
                lng: parseFloat(oMecanicoAsignado.Lng || this.BASE_COORDS.lng)
            };

            const aParaAsignar = aLibres.sort((a: any, b: any) => {
                const distA = this._calculateHaversine(oBaseMecanico.lat, oBaseMecanico.lng, parseFloat(a.Lat), parseFloat(a.Lng));
                const distB = this._calculateHaversine(oBaseMecanico.lat, oBaseMecanico.lng, parseFloat(b.Lat), parseFloat(b.Lng));
                return distA - distB;
            }).slice(0, 3);

            let puntoAnterior = oBaseMecanico;
            let fKmAcumuladosRuta = 0;

            // CÁLCULO SECUENCIAL TRAMO A TRAMO
            aParaAsignar.forEach((s: any, index: number) => {
                const fLatDest = parseFloat(s.Lat);
                const fLngDest = parseFloat(s.Lng);
                const distTramo = this._calculateHaversine(puntoAnterior.lat, puntoAnterior.lng, fLatDest, fLngDest);
                
                fKmAcumuladosRuta += distTramo;
                
                s.AsignadoA = oMecanicoAsignado.Nombre;
                s.CargaNum = index + 1;
                s.DistanciaBase_km = distTramo.toFixed(1); 

                // Lógica de detección de ubicación compartida (distancia < 100 metros)
                if (index > 0 && distTramo < 0.1) {
                    s.isSharedLocation = true;
                    s.SharedLocationIcon = "📍";
                }
                
                puntoAnterior = { lat: fLatDest, lng: fLngDest };
            });

            fKmAcumuladosRuta += this._calculateHaversine(puntoAnterior.lat, puntoAnterior.lng, oBaseMecanico.lat, oBaseMecanico.lng);
            
            // --- ID CON KM TOTALES (Para el GroupHeader) ---
            const sRutaID = `RUTA-${sNombreBase}-${iConsecutivoRuta} | ${fKmAcumuladosRuta.toFixed(1)} km`;
            
            oResumenRutas[sRutaID] = { 
                totalKm: fKmAcumuladosRuta, 
                totalEquipos: aParaAsignar.length 
            };

            aParaAsignar.forEach((s: any) => {
                s.RutaID = sRutaID;
                s.fKmAcumuladosRuta = fKmAcumuladosRuta.toFixed(1);
                oCargaGlobalMecanicos[oMecanicoAsignado.Nombre]++;
            });

            iConsecutivoRuta++;
        }
    });

    // --- FASE 4: ESTADÍSTICAS ---
    let fTotalKmGeneral = 0;
    const aMecanicosStats = aMecanicos.map((m: any) => {
        const aMisServicios = aServicios.filter((s: any) => s.AsignadoA === m.Nombre);
        const fKmTecnico = aMisServicios.reduce((acc: number, curr: any) => {
            return acc + (curr.CargaNum === 1 ? parseFloat(curr.fKmAcumuladosRuta) : 0);
        }, 0);

        fTotalKmGeneral += fKmTecnico;
        const fPorcentaje = Math.round((aMisServicios.length / 6) * 100);

        return {
            Nombre: m.Nombre, 
            Base: m.Base || "Sin Base",
            KmTotales: parseFloat(fKmTecnico.toFixed(1)),
            PorcentajeCarga: fPorcentaje,
            ColorEstado: fPorcentaje > 90 ? "Error" : fPorcentaje > 70 ? "Critical" : "Good"
        };
    });

    oModel.setProperty("/MecanicosStats", aMecanicosStats);
    oModel.setProperty("/TotalKm", fTotalKmGeneral.toFixed(1));
    oModel.setProperty("/ServiciosPendientes", aServicios);
    
    // --- FASE 5: CITAS ---
    const aCitasGlobales = aServicios.map((s: any) => {
        const [day, month, year] = s.FechaProgramada.split('/');
        // Si es ubicación compartida, inyectamos el Icono en el título
        const sAppointmentTitle = s.isSharedLocation ? `${s.SharedLocationIcon} ${s.Equipo}` : `${s.Equipo}`;

        return {
            startDate: new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 9, 0),
            endDate: new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 11, 0),
            title: sAppointmentTitle,
            text: `Ruta: ${s.RutaID}`,
            type: s.isManual ? "Type05" : "Type01"
        };
    });

    oModel.setProperty("/CitasGlobales", aCitasGlobales);
    oModel.refresh(true);
}



public getGroupHeader(oGroup: any): GroupHeaderListItem {
    const oModel = this.getView()?.getModel("db") as JSONModel;
    const aItems: any[] = oModel?.getProperty("/ServiciosPendientes") || [];
    const oContext = aItems.find((s: any) => s.RutaID === oGroup.key);
    
    const sTitle = `${(oContext?.FechaFull || "").split(',')[0].toUpperCase()} | ${oGroup.key}`;
    
    const oHeader = new GroupHeaderListItem({ 
        title: sTitle, 
        upperCase: false, 
        type: "Inactive" 
    });

    // AÑADE ESTA LÍNEA para poder darle estilo en el CSS
    oHeader.addStyleClass("myRouteHeader");

    return oHeader;
}

    private _calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return parseFloat((2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
    }

    


private _calculateFrequencyDate(frecuencia: string, year: number, month: number): string {
    const daysMap: any = { 
        "LUN": 1, "MAR": 2, "MIE": 3, "JUE": 4, "VIE": 5, "SAB": 6, "DOM": 0 
    };
    
    console.log(`[LOG-FRECUENCIA] Procesando código: "${frecuencia}" para Marzo/2026`);

    const sUpper = (frecuencia || "").toUpperCase();
    let date = new Date(year, month, 1);
    
    // 1. Manejo de Comodín 7-LUV (Cualquier día del mes)
    // Lo asignamos por defecto al primer día hábil del mes (evitando fin de semana)
    if (sUpper.includes("7-LUV")) {
        console.log("[LOG-FRECUENCIA] Comodín detectado. Asignando al primer día disponible del mes.");
        while (date.getDay() === 0 || date.getDay() === 6) {
            date.setDate(date.getDate() + 1);
        }
    } else {
        // 2. Manejo de códigos estructurados (Ej: 1-LUN, 2-VIE)
        const aParts = sUpper.split("-");
        const sSemana = aParts[0]; // "1", "2", "3", etc.
        const sDiaBusqueda = aParts[1]; // "LUN", "MAR", etc.

        const iTargetDay = daysMap[sDiaBusqueda];
        
        if (iTargetDay === undefined) {
            console.warn(`[LOG-FRECUENCIA] Día no reconocido: ${sDiaBusqueda}. Usando día 01.`);
        } else {
            // Buscamos la primera ocurrencia de ese día en el mes
            while (date.getDay() !== iTargetDay) {
                date.setDate(date.getDate() + 1);
            }

            // Sumamos semanas según el número (1-Lun no suma, 2-Lun suma 7 días, etc.)
            const iSemanasASumar = parseInt(sSemana) - 1;
            if (iSemanasASumar > 0) {
                date.setDate(date.getDate() + (iSemanasASumar * 7));
            }
        }
    }

    // 3. Validación de desbordamiento (No permitir que salga de Marzo)
    if (date.getMonth() !== month) {
        console.log(`[LOG-FRECUENCIA] La fecha calculada se salía de mes. Ajustando al último día de Marzo.`);
        date = new Date(year, month + 1, 0); // Último día del mes actual
    }

    const sResult = date.toLocaleDateString('es-MX', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });

    console.log(`[LOG-FRECUENCIA] Fecha resultante: ${sResult}`);
    return sResult;
}





    private _updateMechanicKPIs(oModel: JSONModel): void {
        const aMecanicos = oModel.getProperty("/Mecanicos") || [];
        const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
        aMecanicos.forEach((m: any) => {
            m.DistanciaTotal = aServicios.filter((s: any) => s.AsignadoA === m.Nombre).reduce((acc: number, curr: any) => acc + curr.DistanciaBase_km, 0).toFixed(1);
        });
        oModel.setProperty("/Mecanicos", aMecanicos);
    }

public onFilterMecanico(oEvent: any): void {
    // 1. Obtener las llaves seleccionadas (que corresponden al nombre del mecánico en nuestro item)
    const aSelectedKeys = oEvent.getSource().getSelectedKeys() as string[];
    
    // 2. Obtener el binding de la lista de rutas sugeridas
    const oList = this.byId("routeList") as List;
    const oBinding = oList?.getBinding("items") as ListBinding;

    if (!oBinding) {
        console.error("No se pudo encontrar el binding de la lista 'routeList'");
        return;
    }

    // 3. Crear el array de filtros
    let aFilters: Filter[] = [];

    if (aSelectedKeys.length > 0) {
        // Creamos un filtro por cada mecánico seleccionado
        const aMecanicoFilters = aSelectedKeys.map((sName: string) => {
            // "AsignadoA" es el campo que contiene el nombre del mecánico tras la optimización
            return new Filter("AsignadoA", FilterOperator.EQ, sName);
        });
        
        // Agrupamos los filtros en un solo filtro lógico OR (and: false)
        // Esto permite ver servicios del Mecánico A O del Mecánico B
        aFilters.push(new Filter({
            filters: aMecanicoFilters,
            and: false
        }));
    }

    // 4. Aplicar el filtro al binding
    // Usamos FilterType.Application para asegurar que el filtro persista correctamente
    oBinding.filter(aFilters, FilterType.Application);

    // Opcional: Feedback al usuario si la lista queda vacía
    if (aFilters.length > 0) {
        MessageToast.show("Filtrando rutas por mecánicos seleccionados");
    }
}
    public onNavBack(): void {
        const oHistory = History.getInstance();
        if (oHistory.getPreviousHash() !== undefined) window.history.go(-1);
        else UIComponent.getRouterFor(this).navTo("RouteMain", {}, true);
    }

public onSelectService(oEvent: any): void {
    const oItem = oEvent.getSource();
    const oContext = oItem.getBindingContext("db");
    const oService = oContext.getObject();
    const oModel = this.getView()?.getModel("db") as JSONModel;

    // 1. Validaciones iniciales
    if (!oService.RutaID || !this._oMap) {
        return;
    }

    // 2. Limpiar trazos y marcadores previos para no encimar rutas
    this._clearAllRoutes();

    // 3. Obtener todos los puntos de la misma ruta y ordenarlos por número de carga
    const aTodosLosServicios = oModel.getProperty("/ServiciosPendientes") || [];
    const aPuntosDeEstaRuta = aTodosLosServicios
        .filter((s: any) => s.RutaID === oService.RutaID)
        .sort((a: any, b: any) => a.CargaNum - b.CargaNum);

    // 4. Invocar el renderizado de la ruta única
    // Usamos el índice 0 para que tome el primer color (azul) y los pines correspondientes
    this._renderSingleRoute(aPuntosDeEstaRuta, "#2B6CB0", 0);

    // 5. Feedback visual: Mover el mapa al punto seleccionado
    const oPos = { 
        lat: parseFloat(oService.Lat), 
        lng: parseFloat(oService.Lng) 
    };
    
    this._oMap.panTo(oPos);
    this._oMap.setZoom(14);

    console.log("Mostrando ruta para el mecánico:", oService.AsignadoA);
}


/**
 * Limpia todos los trazos actuales del mapa
 */
private _clearAllRoutes(): void {
    this._aDirectionsRenderers.forEach(r => r.setMap(null));
    this._aDirectionsRenderers = [];
    if (this._oCurrentMarker) this._oCurrentMarker.setMap(null);
}

/**
 * Pinta todas las rutas generadas por el algoritmo
 */
public onRenderAllRoutes(): void {
    if (!this._oMap) return;
    this._clearAllRoutes();

    const oModel = this.getView()?.getModel("db") as JSONModel;
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    const aRutasUnicas = [...new Set(aServicios.map((s: any) => s.RutaID))].filter(id => !!id);

    aRutasUnicas.forEach((sRutaID, index) => {
        const aPuntosRuta = aServicios
            .filter((s: any) => s.RutaID === sRutaID)
            .sort((a: any, b: any) => a.CargaNum - b.CargaNum);

        // Pasamos el index (tercer parámetro) para que el Pin cambie de color por mecánico
        this._renderSingleRoute(aPuntosRuta, this._aColors[index % this._aColors.length], index);
    });
}

/**
 * Función auxiliar para pintar una ruta específica con un color
 */
private _renderSingleRoute(aPuntos: any[], sColor: string, iIndex: number): void {
    const oDirectionsService = new google.maps.DirectionsService();
    
    // Colores dinámicos para los pines según el mecánico/ruta
    const aMarkerColors = ["blue", "green", "red", "orange", "purple", "yellow", "pink"];
    const sMarkerColor = aMarkerColors[iIndex % aMarkerColors.length];
    
    // Configuración del trazado de la línea
    const oRenderer = new google.maps.DirectionsRenderer({
        map: this._oMap,
        suppressMarkers: true, // Quitamos los pines por defecto de Google para usar los nuestros
        polylineOptions: {
            strokeColor: sColor,
            strokeWeight: 5,
            strokeOpacity: 0.7
        }
    });

    this._aDirectionsRenderers.push(oRenderer);

    const aWaypoints = aPuntos.map((p: any) => ({
        location: new google.maps.LatLng(parseFloat(p.Lat), parseFloat(p.Lng)),
        stopover: true
    }));

    const request = {
        origin: this._baseCoords || this.BASE_COORDS,
        destination: this._baseCoords || this.BASE_COORDS,
        waypoints: aWaypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false
    };

    oDirectionsService.route(request, (result: any, status: any) => {
        if (status === google.maps.DirectionsStatus.OK) {
            oRenderer.setDirections(result);

            // Pintar los pines personalizados con la info del mecánico
            aPuntos.forEach((oPunto: any) => {
                const oMarker = new google.maps.Marker({
                    position: { lat: parseFloat(oPunto.Lat), lng: parseFloat(oPunto.Lng) },
                    map: this._oMap,
                    title: oPunto.Cliente,
                    icon: `http://maps.google.com/mapfiles/ms/icons/${sMarkerColor}-dot.png`,
                    label: {
                        text: oPunto.CargaNum.toString(),
                        color: "white",
                        fontWeight: "bold"
                    }
                });

                // Contenido dinámico del marcador (Mecánico + Servicio)
                const oInfoWindow = new google.maps.InfoWindow({
                    content: `
                        <div style="padding: 10px; line-height: 1.4;">
                            <strong style="font-size: 14px; color: #1C4D7D;">${oPunto.Cliente}</strong><br>
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 5px 0;">
                            <b>Mecánico:</b> ${oPunto.AsignadoA || "No asignado"}<br>
                            <b>Ruta:</b> ${oPunto.RutaID}<br>
                            <b>Orden de visita:</b> ${oPunto.CargaNum}
                        </div>
                    `
                });

                // Al hacer clic en el Pin, mostramos la info
                oMarker.addListener("click", () => {
                    oInfoWindow.open(this._oMap, oMarker);
                });

                // Guardar para poder limpiar después
                this._aDirectionsRenderers.push(oMarker);
            });
        }
    });
}

public onOpenActionSheet(oEvent: any): void {
    const oButton = oEvent.getSource();
    const oContext = oButton.getBindingContext("db");

    if (!this._oActionSheet) {
        this._oActionSheet = new ActionSheet({
            title: "Opciones de Reasignación",
            showCancelButton: true,
            buttons: [
                new Button({
                    text: "Reasignar Mecánico",
                    icon: "sap-icon://employee",
                    press: () => this._showReassignDialog("Mecanico", oContext)
                }),
                new Button({
                    text: "Reasignar Ruta",
                    icon: "sap-icon://营销-map", // sap-icon://map
                    press: () => this._showReassignDialog("Ruta", oContext)
                }),
                new Button({
                    text: "Reasignar Fecha",
                    icon: "sap-icon://date-time",
                    press: () => this._showReassignDialog("Fecha", oContext)
                })
            ]
        });
        this.getView()?.addDependent(this._oActionSheet);
    }

    this._oActionSheet.openBy(oButton);
}

/**
 * Crea y abre un diálogo dinámico según la opción elegida
 */
private _showReassignDialog(sType: string, oContext: any): void {
    const oModel = this.getView()?.getModel("db") as JSONModel;
    const sTargetEq = oContext.getProperty("Eq"); // ID único del equipo seleccionado
    
    let oInputControl: any;

    if (sType === "Mecanico") {
        oInputControl = new Select({
            width: "100%",
            items: {
                path: "db>/Mecanicos",
                template: new Item({ key: "{db>Nombre}", text: "{db>Nombre}" } as any)
            }
        });
        oInputControl.setSelectedKey(oContext.getProperty("AsignadoA"));
    } else if (sType === "Fecha") {
        oInputControl = new DatePicker({
            width: "100%",
            displayFormat: "dd/MM/yyyy",
            valueFormat: "dd/MM/yyyy",
            value: oContext.getProperty("FechaProgramada")
        });
    } else {
        const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
        const aRutasExistentes = [...new Set(aServicios.map((s: any) => s.RutaID))].filter(id => !!id) as string[];
        oInputControl = new Select({
            width: "100%",
            items: aRutasExistentes.map(sId => new Item({ key: sId, text: sId } as any))
        });
        oInputControl.setSelectedKey(oContext.getProperty("RutaID"));
    }

    const oDialog = new Dialog({
        title: `Reasignar ${sType} (Individual)`,
        content: [oInputControl],
        beginButton: new Button({
            text: "Confirmar",
            type: "Emphasized",
            press: () => {
                const aAllServices = oModel.getProperty("/ServiciosPendientes") || [];
                // Buscamos ÚNICAMENTE el servicio seleccionado por su ID de equipo
                const nIdx = aAllServices.findIndex((s: any) => s.Eq === sTargetEq);

                if (nIdx === -1) {
                    MessageToast.show("Error: No se encontró el servicio");
                    return;
                }

                const sBaseNode = "/ServiciosPendientes/" + nIdx;

                if (sType === "Mecanico") {
                    const sNuevoMecanico = (oInputControl as Select).getSelectedKey();
                    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
                    const oMecData = aMecanicos.find((m: any) => m.Nombre === sNuevoMecanico);

                    // CAMBIO INDIVIDUAL: Solo afectamos este registro
                    oModel.setProperty(sBaseNode + "/AsignadoA", sNuevoMecanico);
                    
                    if (oMecData) {
                        const sFechaLimpia = (aAllServices[nIdx].FechaProgramada || "").replace(/\//g, "");
                        // Se le asigna una nueva RutaID basada en el nuevo mecánico
                        oModel.setProperty(sBaseNode + "/RutaID", `RUTA-${sFechaLimpia}-${oMecData.Id}`);
                    }
                } else if (sType === "Fecha") {
                    const sNewDate = (oInputControl as DatePicker).getValue();
                    oModel.setProperty(sBaseNode + "/FechaProgramada", sNewDate);
                    
                    const [day, month, year] = sNewDate.split('/');
                    const oFechaObj = new Date(+year, +month - 1, +day);
                    const sNombreDia = oFechaObj.toLocaleDateString('es-MX', { weekday: 'long' });
                    const sFormattedDate = sNombreDia.charAt(0).toUpperCase() + sNombreDia.slice(1) + ", " + sNewDate;
                    oModel.setProperty(sBaseNode + "/FechaFull", sFormattedDate);
                } else {
                    // Reasignación directa de Ruta
                    const sNuevaRuta = (oInputControl as Select).getSelectedKey();
                    oModel.setProperty(sBaseNode + "/RutaID", sNuevaRuta);
                    
                    // Opcional: Si la ruta tiene un patrón RUTA-FECHA-IDMECANICO, podrías extraer el mecánico
                    // Pero por ahora, simplemente cambiamos el ID de la ruta para que se mueva de grupo
                }

                // Importante: Marcar como manual para que no sea sobrescrito por lógica automática básica
                oModel.setProperty(sBaseNode + "/isManual", true);

                // Refrescamos y ejecutamos el algoritmo para que recalcule los totales de las rutas involucradas
                oModel.refresh(true);
                this._runRoutingAlgorithm(oModel); 
                this.onRenderAllRoutes();

                oDialog.close();
                MessageToast.show("Servicio movido individualmente");
            }
        }),
        endButton: new Button({
            text: "Cancelar",
            press: () => oDialog.close()
        }),
        afterClose: () => {
            oDialog.destroy();
        }
    });

    this.getView()?.addDependent(oDialog);
    oDialog.open();
}


public async onOpenCalendar(): Promise<void> {
    const oView = this.getView();
    if (!oView) return;

    const oModel = oView.getModel("db") as JSONModel;
    if (!oModel) return;

    // 1. Obtener los servicios (que ya pasaron por el algoritmo y tienen su fecha en Marzo 2026)
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    
    // Forzamos el inicio del calendario en Marzo 2026
    const oTargetDate = new Date(2026, 2, 1); // Marzo es 2

    const aCitasFormateadas = aServicios.map((s: any) => {
        let dStart = s.startDate;

        // Validación: Convertir string "DD/MM/YYYY" a objeto Date de JS
        if (!(dStart instanceof Date) && s.FechaProgramada) {
            const aParts = s.FechaProgramada.split('/');
            dStart = new Date(parseInt(aParts[2]), parseInt(aParts[1]) - 1, parseInt(aParts[0]), 9, 0);
        }

        // Si la fecha sigue siendo inválida o nula, usamos el primer día de Marzo como respaldo
        if (!dStart || isNaN(dStart.getTime())) {
            dStart = new Date(2026, 2, 1, 9, 0); 
        }

        // Duración estándar de 2 horas para la visualización
        const dEnd = new Date(dStart.getTime() + (2 * 60 * 60 * 1000));

        return {
            ...s,
            startDate: dStart,
            endDate: dEnd,
            title: `${s.AsignadoA || 'Técnico'} | ${s.Equipo}`,
            text: `Cliente: ${s.Cliente} | Contrato: ${s.Contrato || 'N/A'}`,
            // Color según urgencia (Type01 = Rojo/Urgente, Type05 = Azul/Normal)
            type: s.Urgencia === "Alta" ? "Type01" : "Type05",
            icon: s.Status === "Activo" ? "sap-icon://activate" : "sap-icon://history"
        };
    });

    // 2. Sincronizamos las citas y forzamos la vista del calendario a Marzo
    oModel.setProperty("/CitasGlobales", aCitasFormateadas);
    oModel.setProperty("/StartDate", oTargetDate);

    // 3. Carga y apertura del Fragmento
    if (!this._pCalendarDialog) {
        this._pCalendarDialog = Fragment.load({
            id: oView.getId(),
            name: "routeplanningmantto.view.fragments.CalendarDialog",
            controller: this
        }).then((oDialog: any) => {
            oView.addDependent(oDialog);
            return oDialog;
        });
    }

    try {
        const oDialog = await this._pCalendarDialog;
        oDialog.open();

        // 4. Refresco forzado para asegurar que SAPUI5 renderice los objetos Date nuevos
        setTimeout(() => {
            const oCalendar = this.byId("idGlobalCalendar") as any;
            if (oCalendar) {
                // Forzamos el scroll o foco a la fecha objetivo
                oCalendar.setStartDate(oTargetDate);
                oCalendar.getBinding("appointments")?.refresh(true);
            }
        }, 150);

    } catch (oError) {
        console.error("Error al abrir el calendario:", oError);
    }
}



public onCloseCalendarDialog(): void {
    this._pCalendarDialog.then(oDialog => oDialog.close());
}
// Dentro de StrategicPlanning.controller.ts

public formatProgressState(iPercentage: any): string {
    // Forzamos a que sea número por si llega como string
    const nValue = parseFloat(iPercentage);
    
    if (nValue >= 90) {
        return "Error";    // Rojo
    } else if (nValue >= 70) {
        return "Warning";  // Amarillo
    } else {
        return "Success";  // Verde
    }
}

public onOpenReassignActions(oEvent: any): void {
    const oButton = oEvent.getSource();
    const oContext = oButton.getBindingContext("db"); // Capturamos el contexto del servicio actual

    const oActionSheet = new ActionSheet({
        title: "Seleccione acción de reasignación",
        showCancelButton: true,
        placement: "Bottom",
        buttons: [
            new Button({
                text: "Reasignar Mecánico",
                icon: "sap-icon://employee",
                press: () => this._showReassignDialog("Mecanico", oContext)
            }),
            new Button({
                text: "Reasignar Fecha",
                icon: "sap-icon://appointment-2",
                press: () => this._showReassignDialog("Fecha", oContext)
            }),
            new Button({
                text: "Reasignar Ruta",
                icon: "sap-icon://map",
                press: () => this._showReassignDialog("Ruta", oContext)
            })
        ],
        cancelButtonPress: function () {
            // Se destruye al cancelar para liberar memoria
            oActionSheet.destroy();
        }
    });

    this.getView()?.addDependent(oActionSheet);
    oActionSheet.openBy(oButton);
}

public onRunSimulation(): void {
    const oViewModel = this.getView()?.getModel("view") as JSONModel;
    const oModel = this.getView()?.getModel("db") as JSONModel;
    
    // IMPORTANTE: Obtenemos los datos según la nueva estructura de SAP
    const oData = oModel.getData();
    const aMecanicos = oData.MechanicRouteSet?.results || oModel.getProperty("/MecanicosStats") || [];
    const aServicios = oData.ServicesRouteSet?.results || oModel.getProperty("/ServiciosPendientes") || [];
    
    if (aServicios.length === 0) {
        MessageToast.show("No hay servicios pendientes para optimizar.");
        return;
    }

    const oBusyDialog = new BusyDialog({
        title: "Motor de Optimización SAP BTP",
        text: "Iniciando análisis de demanda y disponibilidad...",
        showCancelButton: false
    });
    this.getView()?.addDependent(oBusyDialog);
    oBusyDialog.open();

    oViewModel.setProperty("/isCalculating", true);

    // Logs visuales: tomamos una muestra para el usuario
    const aMuestra = aServicios.slice(0, 8);
    let iIndex = 0;

    const fnShowNextLog = () => {
        if (iIndex < aMuestra.length) {
            const oServicio = aMuestra[iIndex];
            
            const oMec = aMecanicos[iIndex % aMecanicos.length];
            const sMecanicoNombre = oMec ? (oMec.Nombre || "Técnico Asignado") : "Buscando técnico...";
            const sClienteNombre = oServicio.Nombre || oServicio.Cliente || "Cliente SAP";

            oBusyDialog.setText(
                `[OPTIMIZANDO]: ${sClienteNombre} \n` +
                `Contrato: ${oServicio.Contrato || 'N/A'} | Técnico: ${sMecanicoNombre}`
            );

            iIndex++;
            setTimeout(fnShowNextLog, 800); 
        } else {
            oBusyDialog.setText("Finalizando balanceo de carga y validación de contratos...");
            
            setTimeout(() => {
                // 1. EJECUCIÓN DEL ALGORITMO (Calcula rutas, KM y CargaNum)
                this._runRoutingAlgorithm(oModel);

                // 2. ENRIQUECIMIENTO POST-OPTIMIZACIÓN
                const aServiciosActualizados = oModel.getProperty("/ServiciosPendientes") || [];
                const aServiciosFinales = aServiciosActualizados.map((s: any) => {
                    // Mapeo de fechas
                    let sFechaTxt = s.FechaProgramada; 
                    if (s.startDate && s.startDate instanceof Date) {
                        sFechaTxt = s.startDate.toLocaleDateString('es-MX', { 
                            day: '2-digit', month: '2-digit', year: 'numeric' 
                        });
                    }

                    // Adaptación para VigenciaIni/Fin que viene de SAP
                    const sVigenciaTxt = (s.VigenciaIni && s.VigenciaIni !== "00000000")
                        ? `${s.VigenciaIni.substring(6,8)}/${s.VigenciaIni.substring(4,6)}/${s.VigenciaIni.substring(0,4)}`
                        : "No definida";

                    // --- LÓGICA DE VISITA ACTUALIZADA ---
                    // Usamos el CargaNum que asignó el _runRoutingAlgorithm
                    let sVisitaLabel = "Programado";
                    if (s.CargaNum) {
                        sVisitaLabel = s.CargaNum === 1 ? "1ra Visita" : 
                                       s.CargaNum === 2 ? "2da Visita" : 
                                       s.CargaNum === 3 ? "3ra Visita" : `${s.CargaNum}ta Visita`;
                    }

                    return {
                        ...s,
                        Cliente: s.Nombre || s.Cliente,
                        FechaFull: sFechaTxt,
                        VigenciaDisplay: sVigenciaTxt,
                        // Aquí asignamos el texto dinámico de la visita
                        RankingTexto: sVisitaLabel, 
                        Contrato: s.Contrato || "N/A",
                        Status: s.Status || "Activo",
                        Direccion: s.DireccionCompleta || s.Direccion || ""
                    };
                });

                oModel.setProperty("/ServiciosPendientes", aServiciosFinales);
                
                // 3. ACTUALIZACIÓN DE MÉTRICAS GLOBALES
                const aRutasUnicas = [...new Set(aServiciosFinales.map((s: { RutaID: any; }) => s.RutaID))].filter(id => id !== "");
                oModel.setProperty("/TotalRutas", aRutasUnicas.length);
                oModel.setProperty("/TotalEquipos", aServiciosFinales.length);
                oModel.setProperty("/TotalClientes", [...new Set(aServiciosFinales.map((s: any) => s.Cliente))].length);
                oModel.setProperty("/TotalMecanicos", aMecanicos.length);
                const iSinAsignar = aServiciosFinales.filter((s: { AsignadoA: any; }) => !s.AsignadoA).length;
                oModel.setProperty("/TotalSinAsignar", iSinAsignar);

                // 4. FINALIZACIÓN
                this.onRenderAllRoutes();
                oViewModel.setProperty("/isOptimized", true);
                oViewModel.setProperty("/isCalculating", false);
                
                oBusyDialog.close();
                oBusyDialog.destroy();
                
                MessageToast.show("Planificación estratégica generada con éxito");
            }, 1000);
        }
    };

    setTimeout(fnShowNextLog, 1000);
}





// Método para volver al estado inicial
public onResetPlanning(): void {
    const oViewModel = this.getView()?.getModel("view") as JSONModel;
    const oModel = this.getView()?.getModel("db") as JSONModel;
    
    // Limpiar banderas isManual e isDirty para permitir re-cálculo limpio
    const aServicios = oModel.getProperty("/ServiciosPendientes");
    aServicios.forEach((s: any) => {
        s.isManual = false;
        s.AsignadoA = null;
        s.RutaID = "";
    });
    
    oViewModel.setProperty("/isOptimized", false);
    oModel.refresh(true);
}


//prueba
/**
 * Función de prueba para validar la respuesta del OData en la consola
 */
public testODataConnection(): void {
    const oComponent = this.getOwnerComponent();
    const ooDataModel = oComponent?.getModel("db") as any;

    if (!ooDataModel) {
        console.error("No se pudo encontrar el modelo 'db'. Revisa tu manifest.json");
        return;
    }

    console.log("Iniciando prueba de lectura OData...");
    const sKey = "ldelacruz@melco.com.mx|032026";

    ooDataModel.read("/HeaderRouteSet('" + sKey + "')", {
        urlParameters: {
            "$expand": "ServicesRouteSet,MechanicRouteSet"
        },
        success: (oData: any) => {
            console.log("✅ ÉXITO - Datos recibidos de SAP:");
            console.log("Estructura completa:", oData);
            
            if (oData.ServicesRouteSet) {
                console.log("Lista de Servicios:", oData.ServicesRouteSet.results);
            }
            
            if (oData.MechanicRouteSet) {
                console.log("Lista de Mecánicos:", oData.MechanicRouteSet.results);
            }
            
            MessageToast.show("Datos recibidos correctamente. Revisa la consola (F12)");
        },
        error: (oError: any) => {
            console.error("❌ ERROR al llamar al OData:", oError);
            MessageBox.error("Error de comunicación: " + JSON.stringify(oError));
        }
    });
}
public formatSAPDate(sDate: string): string {
    if (!sDate || sDate === "00000000") {
        return "Sin fecha";
    }
    // Extraemos partes del string YYYYMMDD
    const sYear = sDate.substring(0, 4);
    const sMonth = sDate.substring(4, 6);
    const sDay = sDate.substring(6, 8);

    return `${sDay}/${sMonth}/${sYear}`;
}

public formatSAPDateRange(sIni: string, sFin: string): string {
    if (!sIni || sIni === "00000000") {
        return "Sin vigencia definida";
    }

    // 1. Función para formatear a DD/MM/YYYY
    const fnFormat = (s: string) => `${s.substring(6, 8)}/${s.substring(4, 6)}/${s.substring(0, 4)}`;
    
    const sFechaInicio = fnFormat(sIni);
    const sFechaFin = sFin && sFin !== "00000000" ? fnFormat(sFin) : "";

    // 2. Cálculo de la duración (Años / Meses)
    let sDuracion = "";
    if (sFin && sFin !== "00000000") {
        const oIni = new Date(+sIni.substring(0, 4), +sIni.substring(4, 6) - 1, +sIni.substring(6, 8));
        const oFin = new Date(+sFin.substring(0, 4), +sFin.substring(4, 6) - 1, +sFin.substring(6, 8));

        let iMonths = (oFin.getFullYear() - oIni.getFullYear()) * 12 + (oFin.getMonth() - oIni.getMonth());
        
        if (iMonths >= 12) {
            const iYears = Math.floor(iMonths / 12);
            const iRemMonths = iMonths % 12;
            sDuracion = iYears === 1 ? " (1 a" : ` (${iYears} a`;
            if (iRemMonths > 0) {
                sDuracion += iRemMonths === 1 ? " 1 m)" : ` ${iRemMonths} m)`;
            } else {
                sDuracion += ")";
            }
        } else {
            sDuracion = iMonths === 1 ? " (1 m)" : ` (${iMonths} m)`;
        }
    }

    // 3. Retorno del texto completo
    return sFechaFin 
        ? `Vigencia: ${sFechaInicio} al ${sFechaFin}${sDuracion}` 
        : `Vigencia: ${sFechaInicio}`;
}



}