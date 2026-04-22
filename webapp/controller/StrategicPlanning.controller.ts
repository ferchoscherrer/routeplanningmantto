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

declare var google: any;

/**
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
        const oDbModel = oComponent?.getModel("db") as JSONModel;

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

        if (oDbModel) {
            this._runRoutingAlgorithm(oDbModel);
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
        //console.log("Esperando a que el contenedor del mapa aparezca en el DOM...");
        //mapElement.style.border = "5px solid red"; 
        //console.log("Contenedor encontrado. Ancho:", mapElement.offsetWidth, "Alto:", mapElement.offsetHeight);
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
                fullscreenControl: false,
                mapTypeControl: false
            });

            console.log("¡Mapa cargado exitosamente!");
            this.initBaseLocation(); 

        } catch (oError) {
            console.error("Error al instanciar el mapa:", oError);
        }
        return;
    }

    // 3. Carga dinámica de la librería (solo si no existe el script en el head)
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

    // 4. Reintento mientras el script termina de cargar globalmente
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
        const bCurrentState = oViewModel.getProperty("/isExpanded");

        if (!bCurrentState) {
            oViewModel.setProperty("/isExpanded", true);
            oViewModel.setProperty("/leftColumnWidth", "100%");
            oViewModel.setProperty("/rightColumnWidth", "0%");
            oViewModel.setProperty("/expandIcon", "sap-icon://exit-full-screen");
        } else {
            oViewModel.setProperty("/isExpanded", false);
            oViewModel.setProperty("/leftColumnWidth", "50%");
            oViewModel.setProperty("/rightColumnWidth", "50%");
            oViewModel.setProperty("/expandIcon", "sap-icon://full-screen");

            setTimeout(() => {
                this._refreshMapLayout();
            }, 350);
        }
    }

    private _refreshMapLayout(): void {
        if (typeof google !== "undefined" && this._oMap) {
            google.maps.event.trigger(this._oMap, 'resize');
            this._oMap.setCenter(this.BASE_COORDS);
        }
    }
private _runRoutingAlgorithm(oModel: JSONModel): void {
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    const sStartDate = oModel.getProperty("/StartDate");
    const oBaseDate = new Date(sStartDate || "2026-04-01");

    // --- FASE 1: PREPARACIÓN Y RESETEO ---
    aServicios.forEach((s: any) => {
        // Calculamos distancia a la base siempre como referencia
        s.DistanciaBase_km = this._calculateHaversine(this.BASE_COORDS.lat, this.BASE_COORDS.lng, parseFloat(s.Lat), parseFloat(s.Lng));
        
        // Solo reseteamos y calculamos fechas para servicios que NO han sido gestionados manualmente
        if (!s.isManual) {
            if (!s.FechaProgramada) {
                s.FechaProgramada = this._calculateFrequencyDate(s.Frecuencia, oBaseDate.getFullYear(), oBaseDate.getMonth());
            }
            s.AsignadoA = null;
            s.RutaID = "";
            
            const [day, month, year] = s.FechaProgramada.split('/');
            const oFechaObj = new Date(+year, +month - 1, +day);
            const sNombreDia = oFechaObj.toLocaleDateString('es-MX', { weekday: 'long' });
            s.FechaFull = sNombreDia.charAt(0).toUpperCase() + sNombreDia.slice(1) + ", " + s.FechaProgramada;
        }
    });

    const oResumenRutas: any = {};
    const oCargaGlobalMecanicos: any = {};
    aMecanicos.forEach((m: any) => oCargaGlobalMecanicos[m.Nombre] = 0);

    // --- FASE 2: REGISTRAR CARGA DE REASIGNACIONES MANUALES ---
    // Esto es vital para que el algoritmo sepa que el mecánico ya está ocupado
    aServicios.filter((s: any) => s.isManual && s.AsignadoA).forEach((s: any) => {
        if (!oResumenRutas[s.RutaID]) oResumenRutas[s.RutaID] = { totalKm: 0, totalEquipos: 0 };
        oResumenRutas[s.RutaID].totalEquipos++;
        if (oCargaGlobalMecanicos.hasOwnProperty(s.AsignadoA)) {
            oCargaGlobalMecanicos[s.AsignadoA]++;
        }
    });

    // --- FASE 3: ASIGNACIÓN AUTOMÁTICA DE SERVICIOS RESTANTES ---
    const oServiciosPorFecha: any = {};
    aServicios.forEach((s: any) => {
        if (!oServiciosPorFecha[s.FechaProgramada]) oServiciosPorFecha[s.FechaProgramada] = [];
        oServiciosPorFecha[s.FechaProgramada].push(s);
    });

    Object.keys(oServiciosPorFecha).sort().forEach(sFecha => {
        const aEquiposDelDia = oServiciosPorFecha[sFecha];
        let bHayEquiposLibres = true;

        while (bHayEquiposLibres) {
            // FILTRO CRÍTICO: El algoritmo solo ve lo que no tiene mecánico y no es manual
            const aLibres = aEquiposDelDia.filter((s: any) => !s.AsignadoA && !s.isManual);
            if (aLibres.length === 0) { bHayEquiposLibres = false; break; }

            // Buscamos al mecánico con menos carga actual (incluyendo lo manual)
            const oMecanicoAsignado = aMecanicos
                .filter((m: any) => !oResumenRutas[`RUTA-${sFecha.replace(/\//g, "")}-${m.Id}`])
                .sort((a: any, b: any) => oCargaGlobalMecanicos[a.Nombre] - oCargaGlobalMecanicos[b.Nombre])[0];

            if (!oMecanicoAsignado) break;

            const sRutaID = `RUTA-${sFecha.replace(/\//g, "")}-${oMecanicoAsignado.Id}`;
            if (!oResumenRutas[sRutaID]) oResumenRutas[sRutaID] = { totalKm: 0, totalEquipos: 0 };

            const aParaAsignar = aLibres.sort((a: any, b: any) => a.DistanciaBase_km - b.DistanciaBase_km).slice(0, 3);
            let puntoActual = this.BASE_COORDS;

            aParaAsignar.forEach((s: any, index: number) => {
                s.AsignadoA = oMecanicoAsignado.Nombre;
                s.RutaID = sRutaID;
                s.CargaNum = index + 1;
                s.RankingTexto = (index + 1) === 1 ? "1ra Visita" : (index + 1) === 2 ? "2da Visita" : "3ra Visita";
                
                oCargaGlobalMecanicos[oMecanicoAsignado.Nombre]++;
                oResumenRutas[sRutaID].totalEquipos++;
                const dist = this._calculateHaversine(puntoActual.lat, puntoActual.lng, parseFloat(s.Lat), parseFloat(s.Lng));
                oResumenRutas[sRutaID].totalKm += dist;
                puntoActual = { lat: parseFloat(s.Lat), lng: parseFloat(s.Lng) };
            });
        }
    });

    // --- FASE 4: ACTUALIZACIÓN DE ESTADÍSTICAS FINALES ---
    let fTotalKmGeneral = 0;
    aServicios.forEach((s: any) => {
        if (s.RutaID && oResumenRutas[s.RutaID]) {
            s.RutaTotalKm = oResumenRutas[s.RutaID].totalKm.toFixed(2);
            s.RutaTotalEquipos = oResumenRutas[s.RutaID].totalEquipos;
        }
    });

    const aMecanicosStats = aMecanicos.map((m: any) => {
        const aMisServicios = aServicios.filter((s: any) => s.AsignadoA === m.Nombre);
        const fKmTecnico = aMisServicios.reduce((acc: number, curr: any) => acc + (parseFloat(curr.DistanciaBase_km) || 0), 0);
        fTotalKmGeneral += fKmTecnico;
        
        const iMaxEquipos = 6; 
        const fPorcentaje = Math.round((aMisServicios.length / iMaxEquipos) * 100);

        return {
            Nombre: m.Nombre,
            KmTotales: parseFloat(fKmTecnico.toFixed(1)),
            PorcentajeCarga: fPorcentaje,
            ColorEstado: fPorcentaje > 90 ? "Error" : fPorcentaje > 70 ? "Critical" : "Good",
            ColorKm: fKmTecnico > 50 ? "Error" : "Neutral"
        };
    });

    // Actualizar métricas globales en el modelo
    oModel.setProperty("/TotalEquipos", aServicios.length);
    oModel.setProperty("/TotalKm", fTotalKmGeneral.toFixed(1));
    oModel.setProperty("/TotalRutas", [...new Set(aServicios.map((s: any) => s.RutaID).filter((id: string) => !!id))].length);
    oModel.setProperty("/TotalMecanicos", aMecanicosStats.filter((m: any) => m.KmTotales > 0).length);
    oModel.setProperty("/TotalClientes", [...new Set(aServicios.map((s: any) => s.Cliente).filter((c: string) => !!c))].length);
    oModel.setProperty("/TotalSinAsignar", aServicios.filter((s: any) => !s.AsignadoA).length);
    oModel.setProperty("/MecanicosStats", aMecanicosStats);

    // --- FASE 5: GENERACIÓN DE CITAS PARA EL CALENDARIO ---
    const aCitasGlobales = aServicios.map((s: any) => {
       const [day, month, year] = s.FechaProgramada.split('/');
    const oFechaInicio = new Date(+year, +month - 1, +day, 9, 0);
    const oFechaFin = new Date(+year, +month - 1, +day, 11, 0);

    // IMPORTANTE: Guardar la fecha objeto directamente en el servicio
    s.startDate = oFechaInicio; 
    s.endDate = oFechaFin;
        return {
            startDate: oFechaInicio,
        endDate: oFechaFin,
        title: `${s.AsignadoA} | ${s.Equipo}`, 
        text: `Cliente: ${s.Cliente}`,
        type: s.isManual ? "Type05" : "Type01",
        icon: s.isManual ? "sap-icon://user-edit" : "sap-icon://shipping-status"
        };
    });

    oModel.setProperty("/CitasGlobales", aCitasGlobales);
    oModel.setProperty("/ServiciosPendientes", aServicios);
    oModel.refresh(true);
}







public getGroupHeader(oGroup: any): GroupHeaderListItem {
    const oModel = this.getView()?.getModel("db") as JSONModel;
    const aItems: any[] = oModel?.getProperty("/ServiciosPendientes") || [];
    const oContext = aItems.find((s: any) => s.RutaID === oGroup.key);
    
    const sTitle = `${(oContext?.FechaFull || "").split(',')[0].toUpperCase()} | ${oGroup.key} ▸ 🚛 ${oContext?.RutaTotalKm || 0} km`;
    
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
        const daysMap: any = { "DOMINGO": 0, "LUNES": 1, "MARTES": 2, "MIERCOLES": 3, "MIÉRCOLES": 3, "JUEVES": 4, "VIERNES": 5, "SABADO": 6 };
        const targetDayKey = Object.keys(daysMap).find(d => frecuencia.toUpperCase().includes(d));
        if (!targetDayKey) return `${year}-${month + 1}-01`;
        let date = new Date(year, month, 1);
        while (date.getDay() !== daysMap[targetDayKey]) date.setDate(date.getDate() + 1);
        if (frecuencia.toUpperCase().includes("SEGUNDO")) date.setDate(date.getDate() + 7);
        else if (frecuencia.toUpperCase().includes("TERCER")) date.setDate(date.getDate() + 14);
        else if (frecuencia.toUpperCase().includes("CUARTO")) date.setDate(date.getDate() + 21);
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

    // 1. Obtener los servicios (que ya pasaron por onRunSimulation y tienen su fecha calculada)
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    
    const aCitasFormateadas = aServicios.map((s: any) => {
        /**
         * IMPORTANTE: Aquí usamos el resultado de tu función _calculateFrequencyDate.
         * Si tu función guarda el resultado en 'FechaProgramada' o 'startDate', 
         * asegúrate de que el nombre coincida aquí.
         */
       let dStart = s.startDate;

        // Validación: Si por alguna razón no es objeto Date, lo convertimos
        if (!dStart && s.FechaProgramada) {
        const [day, month, year] = s.FechaProgramada.split('/');
        dStart = new Date(+year, +month - 1, +day, 9, 0);
    }

        // Si la fecha es inválida o nula, asignamos una por defecto para evitar que el calendario rompa
        if (!dStart || isNaN(dStart.getTime())) {
            dStart = new Date(); 
        }

        // Definimos una duración de 2 horas para la visualización en el calendario
        const dEnd = new Date(dStart.getTime() + (2 * 60 * 60 * 1000));

        return {
            ...s,
            startDate: dStart,
            endDate: dEnd,
            // Construimos el título con los datos robustos que validamos antes
            title: `${s.AsignadoA || 'Técnico'} | ${s.Equipo}`,
            text: `Contrato: ${s.Contrato} | Status: ${s.Status}`,
            // Color según urgencia
            type: s.Urgencia === "Alta" ? "Type01" : "Type05",
            icon: s.Status === "Activo" ? "sap-icon://activate" : "sap-icon://history"
        };
    });

    // 2. Sincronizamos las citas y ajustamos la fecha de inicio del calendario al primer servicio
    oModel.setProperty("/CitasGlobales", aCitasFormateadas);
    
    if (aCitasFormateadas.length > 0) {
        // Esto asegura que el calendario se abra en el mes/día donde hay datos
        oModel.setProperty("/StartDate", aCitasFormateadas[0].startDate);
    }

    // 3. Carga del Fragmento
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

        // 4. Refresco forzado del binding para visualizar los objetos Date
        setTimeout(() => {
            const oCalendar = this.byId("idGlobalCalendar") as any;
            if (oCalendar) {
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
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    
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
            
            oBusyDialog.setText(
                `[OPTIMIZANDO]: ${oServicio.Cliente} \n` +
                `Contrato: ${oServicio.Contrato} | Técnico: ${oMec.Nombre}`
            );

            iIndex++;
            setTimeout(fnShowNextLog, 800); 
        } else {
            oBusyDialog.setText("Finalizando balanceo de carga y validación de contratos...");
            
            setTimeout(() => {
                // 1. EJECUCIÓN DEL ALGORITMO
                this._runRoutingAlgorithm(oModel);

                // 2. ENRIQUECIMIENTO POST-OPTIMIZACIÓN
                const aServiciosFinales = oModel.getProperty("/ServiciosPendientes").map((s: any) => {
                    // Formateo de fecha para la vista
                    let sFechaTxt = s.FechaProgramada; 
                    if (s.startDate && s.startDate instanceof Date) {
                        sFechaTxt = s.startDate.toLocaleDateString('es-MX', { 
                            day: '2-digit', month: '2-digit', year: 'numeric' 
                        });
                    }

                    // --- MEJORA VIGENCIA: Procesa el nuevo objeto de db.json ---
                    const sVigenciaTxt = (s.Vigencia && s.Vigencia.Inicio) 
                        ? `${s.Vigencia.Inicio} al ${s.Vigencia.Fin}` 
                        : "No definida";

                    return {
                        ...s,
                        FechaFull: sFechaTxt,
                        VigenciaDisplay: sVigenciaTxt, // Campo para el CustomListItem
                        RankingTexto: s.Prioridad === 1 ? "Prioridad Crítica" : "Programado",
                        Contrato: s.Contrato || "N/A",
                        Status: s.Status || "Activo",
                        Direccion: s.Direccion || ""
                    };
                });

                oModel.setProperty("/ServiciosPendientes", aServiciosFinales);
                
                // 3. ACTUALIZACIÓN DE MÉTRICAS
                const iTotalEquipos = aServiciosFinales.length;
                const iTotalClientes = [...new Set(aServiciosFinales.map((s: any) => s.Cliente))].length;
                
                oModel.setProperty("/TotalEquipos", iTotalEquipos);
                oModel.setProperty("/TotalClientes", iTotalClientes);
                oModel.setProperty("/TotalMecanicos", aMecanicos.length);

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

}