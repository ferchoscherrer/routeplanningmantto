import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import History from "sap/ui/core/routing/History";
import UIComponent from "sap/ui/core/UIComponent";
import Sorter from "sap/ui/model/Sorter";
import MessageBox from "sap/m/MessageBox";
import ActionSheet from "sap/m/ActionSheet";
import Button from "sap/m/Button";


/**
 * @namespace routeplanningmantto.controller
 */
export default class RoutePlanMonth extends Controller {
    private _map: any;
    private _markers: any[] = [];
    private _polylines: any[] = [];
    private _base = { lat: 19.54471, lng: -99.19305 };
    private _cpDialog: any;
    private _oActionSheet: any;
    private _oReassignDialog: any;
    private _sSelectedAppointmentPath: string;
    private _oCurrentAppointment: any;
    private _baseCoords: { lat: number, lng: number };
    private readonly BASE_COORDS = { lat: 19.54471, lng: -99.19305 };

    // --- CICLO DE VIDA ---

    public onInit(): void {
        const oComponent = this.getOwnerComponent();
        const oDbModel = oComponent?.getModel("db") as JSONModel;

        if (oDbModel) {
            if (oDbModel.getProperty("/Mecanicos")) {
                this._setupLocalData(oDbModel);
            } else {
                oDbModel.attachRequestCompleted(() => {
                    this._setupLocalData(oDbModel);
                });
            }
        } else {
            console.error("No se encontró el modelo 'db' en el manifest.");
        }
    }

    private _geocodeAddress(sAddress: string): Promise<any> {
    const oGeocoder = new window.google.maps.Geocoder();

    return new Promise((resolve, reject) => {
        oGeocoder.geocode({ address: sAddress }, (results: any, status: string) => {
            if (status === "OK" && results[0]) {
                const oLocation = results[0].geometry.location;
                const oCoords = {
                    lat: oLocation.lat(),
                    lng: oLocation.lng()
                };
                console.log("Coordenadas obtenidas:", oCoords);
                resolve(oCoords);
            } else {
                reject("No se pudo geocodificar la dirección: " + status);
            }
        });
    });
}


// Cambiamos :void por :Promise<void>
public async initBaseLocation(): Promise<void> {
    const sDireccionBase = "Calle Mariano Escobedo 69, Centro Industrial Tlalnepantla, 54030 Tlalnepantla, Méx., México";
    
    try {
        const oCoords = await this._geocodeAddress(sDireccionBase);
        
        // Ahora sí existe la propiedad para asignar
        this._baseCoords = oCoords; 
        
        this._drawBaseMarker(this._baseCoords);
        
    } catch (error) {
        console.error("Error al geocodificar, usando respaldo:", error);
        // Usamos el respaldo si la API falla
        this._baseCoords = this.BASE_COORDS;
        this._drawBaseMarker(this._baseCoords);
    }
}



   private _setupLocalData(oModel: JSONModel): void {
    this._parseODataSimulation(oModel);

    // --- NUEVO: Inicialización para la Doble Vista ---
    // Definimos la vista inicial (Por Mecánico)
    oModel.setProperty("/CurrentView", "Mecanicos");
    
    // Inicializamos el contenedor de citas para el calendario mensual (cuadrícula)
    // Si ya existen citas en los mecánicos, las consolidamos aquí también
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    let aCitasGlobales: any[] = [];

    aMecanicos.forEach((oMec: any) => {
        if (oMec.Citas && oMec.Citas.length > 0) {
            oMec.Citas.forEach((oCita: any) => {
                aCitasGlobales.push({
                    ...oCita,
                    title: `${oMec.Nombre}: ${oCita.title}`
                });
            });
        }
    });
    oModel.setProperty("/CitasGlobales", aCitasGlobales);
    // ------------------------------------------------

    this.getView()?.setModel(oModel, "localModel");
    this._simulateProfessionalRoutes(false);

    MessageToast.show("Base de Datos cargada: " + aMecanicos.length + " mecánicos listos.");
}

public onViewChange(oEvent: any): void {
    const sKey = oEvent.getParameter("key");
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    
    // Actualizamos la propiedad que controla la visibilidad (visible="{= ${localModel>/CurrentView} === '...' }")
    oModel?.setProperty("/CurrentView", sKey);

    // Si cambia a la vista mensual, forzamos la reconstrucción del "espejo"
    if (sKey === "Mensual") {
        this._syncGlobalAppointments();
    }
}

    private _parseODataSimulation(oModel: JSONModel): void {
        const aMecanicos = oModel.getProperty("/Mecanicos") || [];
        aMecanicos.forEach((mecanico: any) => {
            if (mecanico.Citas) {
                mecanico.Citas.forEach((cita: any) => {
                    // Normalización de fechas para PlanningCalendar
                    cita.startDate = new Date(cita.startDate || cita.Inicio);
                    cita.endDate = new Date(cita.endDate || cita.Fin);
                });
            }
        });
        const sStartDate = oModel.getProperty("/StartDate");
        if (sStartDate) {
            oModel.setProperty("/StartDate", new Date(sStartDate));
        }
    }

    // --- MOTOR DE FRECUENCIAS (NUEVO) ---

    private _calculateServiceDate(sRule: string, iYear: number, iMonth: number): Date {
        let oDate = new Date(iYear, iMonth, 1);
        const sUpperRule = (sRule || "").toUpperCase();
        const daysMap: any = { 
            "DOMINGO": 0, "LUNES": 1, "MARTES": 2, "MIERCOLES": 3, 
            "MIÉRCOLES": 3, "JUEVES": 4, "VIERNES": 5, "SABADO": 6, "SÁBADO": 6 
        };
        
        for (let dayName in daysMap) {
            if (sUpperRule.includes(dayName)) {
                return this._getNthDayOfMonth(iYear, iMonth, daysMap[dayName], sUpperRule);
            }
        }
        // Fallback: Primer día hábil
        while (oDate.getDay() === 0 || oDate.getDay() === 6) oDate.setDate(oDate.getDate() + 1);
        return oDate;
    }

    private _getNthDayOfMonth(iYear: number, iMonth: number, iDayOfWeek: number, sRule: string): Date {
        let iTargetOccurrence = 1;
        if (sRule.includes("SEGUNDO")) iTargetOccurrence = 2;
        if (sRule.includes("TERCER")) iTargetOccurrence = 3;
        if (sRule.includes("CUARTO")) iTargetOccurrence = 4;

        if (sRule.includes("ÚLTIMO") || sRule.includes("ULTIMO")) {
            let oDate = new Date(iYear, iMonth + 1, 0);
            while (oDate.getDay() !== iDayOfWeek) oDate.setDate(oDate.getDate() - 1);
            return oDate;
        }

        let oDate = new Date(iYear, iMonth, 1);
        let iCount = 0;
        while (iCount < iTargetOccurrence) {
            if (oDate.getDay() === iDayOfWeek) iCount++;
            if (iCount < iTargetOccurrence) oDate.setDate(oDate.getDate() + 1);
        }
        return oDate;
    }

    // --- MANEJO DE MAPA Y RENDERING ---

    private _checkAndInitMap(attempts: number): void {
        const mapDiv = document.getElementById("mapMonthDiv");
        if (window.google && window.google.maps && mapDiv) {
            this._initMap();
            return;
        }
        if (attempts < 20) {
            setTimeout(() => this._checkAndInitMap(attempts + 1), 500);
        }
    }

    public onMapContainerRendered(): void {
        setTimeout(() => {
            this._initMap();
        }, 300);
    }

    private _initMap(): void {
    const mapDiv = document.getElementById("mapMonthDiv");
    
    // Si no hay div o ya hay mapa, no hacemos nada
    if (!mapDiv || !window.google || this._map) return;

    // 1. Crear la instancia del mapa
    // Usamos BASE_COORDS como centro inicial mientras se geocodifica la real
    this._map = new window.google.maps.Map(mapDiv, {
        center: this.BASE_COORDS, 
        zoom: 13,
        mapTypeId: 'roadmap',
        styles: [ /* Tus estilos personalizados si tienes */ ]
    });

    mapDiv.style.backgroundColor = "transparent";

    // 2. Evento IDLE: Solo se dispara cuando el mapa terminó de cargar
    window.google.maps.event.addListenerOnce(this._map, 'idle', () => {
        // Dibujamos las rutas globales (las de colores)
        this._simulateProfessionalRoutes(false);
    });

    // 3. INICIALIZAR BASE (Mariano Escobedo 69)
    // Esta función geocodifica, guarda en this._baseCoords y llama a _drawBaseMarker()
    this.initBaseLocation().then(() => {
        // Opcional: Centrar el mapa en la base real una vez obtenida
        if (this._baseCoords) {
            this._map.setCenter(this._baseCoords);
        }
    });
}
    // --- LÓGICA DE RUTAS Y OPTIMIZACIÓN ---

    private _simulateProfessionalRoutes(bOptimized: boolean): void {
        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        if (!oModel || !this._map) return;

        const aServiciosPendientes = oModel.getProperty("/ServiciosPendientes") || [];
        const aMecanicos = oModel.getProperty("/Mecanicos") || [];
        
        let aTodosLosServicios: any[] = [];

        aServiciosPendientes.forEach((s: any) => {
            if (s.MecanicoAsignadoId) aTodosLosServicios.push(s);
        });

        aMecanicos.forEach((mec: any) => {
            if (mec.Citas) {
                mec.Citas.forEach((cita: any) => {
                    aTodosLosServicios.push({
                        Id: cita.Id, Lat: cita.Lat, Lng: cita.Lng,
                        MecanicoAsignadoId: mec.Id, Prioridad: cita.Prioridad || 1
                    });
                });
            }
        });

        if (this._map) {
            this._polylines.forEach(p => p.setMap(null));
            this._markers.forEach(m => m.setMap(null));
            this._polylines = [];
            this._markers = [];
        }

        const oDirectionsService = new window.google.maps.DirectionsService();

        aMecanicos.forEach((mecanico: any) => {
            const aMisServicios = aTodosLosServicios.filter((s: any) => s.MecanicoAsignadoId === mecanico.Id);
            
            if (aMisServicios.length > 0) {
                const waypoints = aMisServicios.map((s: any) => ({
                    location: { lat: parseFloat(s.Lat), lng: parseFloat(s.Lng) },
                    stopover: true
                }));

                oDirectionsService.route({
                    origin: this._baseCoords, destination: this._baseCoords,
                    waypoints: waypoints, optimizeWaypoints: bOptimized,
                    travelMode: window.google.maps.TravelMode.DRIVING,
                }, (result: any, status: any) => {
                    if (status === "OK" && this._map) {
                        const sColor = mecanico.Id === "M1" ? "#4285F4" : "#34A853";
                        const polyline = new window.google.maps.Polyline({
                            path: result.routes[0].overview_path,
                            strokeColor: sColor, strokeOpacity: 0.8, strokeWeight: 5, map: this._map
                        });
                        this._polylines.push(polyline);

                        result.routes[0].legs.forEach((leg: any, i: number) => {
                            if (i < result.routes[0].legs.length - 1) {
                                const marker = new window.google.maps.Marker({
                                    position: leg.end_location, map: this._map,
                                    title: aMisServicios[i]?.Cliente || "Servicio",
                                    label: { text: (i + 1).toString(), color: "white" },
                                    icon: {
                                        path: window.google.maps.SymbolPath.CIRCLE,
                                        fillColor: sColor, fillOpacity: 1, strokeWeight: 2, strokeColor: "white", scale: 10
                                    }
                                });
                                this._markers.push(marker);
                            }
                        });

                        let iTotalMeters = 0, iTotalSeconds = 0;
                        result.routes[0].legs.forEach((leg: any) => {
                            iTotalMeters += leg.distance.value;
                            iTotalSeconds += leg.duration.value;
                        });

                        mecanico.DistanciaTotal = (iTotalMeters / 1000).toFixed(1);
                        mecanico.TiempoEstimado = this._formatSeconds(iTotalSeconds);
                        oModel.refresh(true);
                    }
                });
            } else {
                mecanico.DistanciaTotal = "0.0";
                mecanico.TiempoEstimado = "0m";
                oModel.refresh(true);
            }
        });
    }

    public onRunOptimization(): void {
        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
        const oCalendar = this.byId("calendarMonthly") as any;
        const oCurrentDate = oCalendar?.getStartDate() || new Date();

        MessageToast.show("Ejecutando modelo de optimización y reglas de frecuencia...");
        
        this._markers.forEach(m => {
            m.setAnimation(window.google.maps.Animation.BOUNCE);
            setTimeout(() => m.setAnimation(null), 1500);
        });

        aServicios.forEach((s: any) => {
            // Asignación de fecha basada en la regla (ej: "Primer Lunes")
            s.FechaSugerida = this._calculateServiceDate(s.Frecuencia, oCurrentDate.getFullYear(), oCurrentDate.getMonth());
        });

        setTimeout(() => {
            this._simulateProfessionalRoutes(true);
            oModel.refresh(true);
            MessageToast.show("Optimización completada.");
        }, 1600);
    }

    // --- EVENTOS DE UI Y HOVER ---

    public onItemHover(oEvent: any): void {
        const oBindingContext = oEvent.getSource().getBindingContext("localModel");
        const sCliente = oBindingContext.getProperty("Cliente");

        this._polylines.forEach((polyline, index) => {
            const oMarker = this._markers[index];
            if (oMarker && oMarker.getTitle() === sCliente) {
                polyline.setOptions({ strokeOpacity: 1.0, strokeWeight: 8, zIndex: 100 });
                oMarker.setAnimation(window.google.maps.Animation.BOUNCE);
            } else {
                polyline.setOptions({ strokeOpacity: 0.1, strokeWeight: 2, zIndex: 1 });
            }
        });
    }

    public onItemLeave(): void {
        this._polylines.forEach((polyline) => {
            polyline.setOptions({ strokeOpacity: 0.7, strokeWeight: 5, zIndex: 5 });
        });
        this._markers.forEach(m => m.setAnimation(null));
    }

   public onAppointmentSelect(oEvent: any): void {
    const oAppointment = oEvent.getParameter("appointment");
    if (!oAppointment || !this._map) return;

    // ACTUALIZAMOS LA REFERENCIA SIEMPRE (Aquí está el truco)
    this._oCurrentAppointment = oAppointment;
    this._sSelectedAppointmentPath = oAppointment.getBindingContext("localModel").getPath();

    if (!this._oActionSheet) {
        this._oActionSheet = new ActionSheet({
            title: "Opciones de Mantenimiento",
            showCancelButton: true,
            buttons: [
                new Button({
                    text: "Reasignar Fecha",
                    icon: "sap-icon://move",
                    press: () => this._openReassignDialog()
                }),
                new Button({
                    text: "Localizar y Ver Ruta del Día",
                    icon: "sap-icon://map-2",
                    press: () => {
                        // Usamos la referencia que actualizamos globalmente
                        if (this._oCurrentAppointment) {
                            const oCtx = this._oCurrentAppointment.getBindingContext("localModel").getObject();
                            console.log("Localizando dinámicamente:", oCtx.title);
                            
                            this._focusMarkerAndZoom(oCtx);
                            this._filterRouteByService(oCtx);
                        }
                    }
                }),
                new Button({
                    text: "Centrar Marcador",
                    icon: "sap-icon://locate-me",
                    press: () => {
                        if (this._oCurrentAppointment) {
                            const oCtx = this._oCurrentAppointment.getBindingContext("localModel").getObject();
                            const sCliente = oCtx.title || oCtx.Cliente;
                            
                            this._map.setZoom(16);
                            this._map.panTo({ lat: parseFloat(oCtx.Lat), lng: parseFloat(oCtx.Lng) });
                            
                            const oMarker = this._markers.find(m => m.getTitle() === sCliente);
                            if (oMarker) {
                                oMarker.setAnimation(window.google.maps.Animation.BOUNCE);
                                setTimeout(() => oMarker.setAnimation(null), 2000);
                            }
                        }
                    }
                })
            ]
        });
        this.getView()?.addDependent(this._oActionSheet);
    }

    this._oActionSheet.openBy(oAppointment);
}





private _openReassignDialog(): void {
    const aFechas = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = 2026;

    // Generamos los días del mes actual
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(currentYear, currentMonth, i);
        // Omitimos fines de semana si prefieres (opcional)
        if (d.getDay() !== 0 && d.getDay() !== 6) { 
            aFechas.push({
                fechaFull: new Date(d),
                fechaTexto: d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                diaSemana: d.toLocaleDateString('es-MX', { weekday: 'long' })
            });
        }
    }

    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    oModel.setProperty("/FechasDisponibles", aFechas);

    if (!this._oReassignDialog) {
        this._oReassignDialog = sap.ui.xmlfragment("routeplanningmantto.view.fragments.ReassignDate", this);
        this.getView()?.addDependent(this._oReassignDialog);
    }
    this._oReassignDialog.open();
}

/**
 * Procesa el cambio de fecha una vez seleccionada
 */
public onConfirmReassignDate(oEvent: any): void {
    const oSelectedItem = oEvent.getParameter("selectedItem");
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    
    if (oSelectedItem && this._sSelectedAppointmentPath) {
        const oFechaObj = oSelectedItem.getBindingContext("localModel").getObject();
        const dNuevaFecha = new Date(oFechaObj.fechaFull);
        dNuevaFecha.setHours(9, 0, 0);
        const dFin = new Date(dNuevaFecha.getTime() + (2 * 60 * 60 * 1000));

        // CASO A: Si el usuario movió la cita desde la Vista Mensual
        if (this._sSelectedAppointmentPath.includes("FilaMensualGlobal")) {
            // 1. Buscamos la cita original en el arreglo de Mecánicos para que el cambio sea permanente
            const oCitaMensual = oModel.getProperty(this._sSelectedAppointmentPath);
            const aMecanicos = oModel.getProperty("/Mecanicos");
            
            // Buscamos por algún ID único que tengan tus servicios (ej. Id o NumeroOrden)
            let bEncontrado = false;
            aMecanicos.forEach((oMec: any, iMec: number) => {
                oMec.Citas.forEach((oCita: any, iCita: number) => {
                    if (oCita.title === oCitaMensual.title) { // O usa un ID único si lo tienes
                        const sPathOriginal = `/Mecanicos/${iMec}/Citas/${iCita}`;
                        oModel.setProperty(sPathOriginal + "/startDate", dNuevaFecha);
                        oModel.setProperty(sPathOriginal + "/endDate", dFin);
                        bEncontrado = true;
                    }
                });
            });
        } 
        // CASO B: Si el usuario movió la cita desde la Vista por Mecánico
        else {
            oModel.setProperty(this._sSelectedAppointmentPath + "/startDate", dNuevaFecha);
            oModel.setProperty(this._sSelectedAppointmentPath + "/endDate", dFin);
        }
        
        // 2. FUNDAMENTAL: Re-sincronizar la vista mensual con los nuevos datos de mecánicos
        this._syncGlobalAppointments(); 
        
        // 3. Forzar actualización de UI
        oModel.updateBindings(true);
        
        // 4. Actualizar rutas en mapa
        this._simulateProfessionalRoutes(true);
        
        MessageToast.show(`Sincronizado: Movido al ${oFechaObj.fechaTexto}`);
    }
}

/**
 * Centra el mapa en las coordenadas de la cita seleccionada
 */
private _centerMapOnAppointment(): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const oCita = oModel.getProperty(this._sSelectedAppointmentPath);
    
    if (this._map && oCita.Lat && oCita.Lng) {
        this._map.setZoom(16);
        this._map.panTo({ lat: parseFloat(oCita.Lat), lng: parseFloat(oCita.Lng) });
    }
}

    // --- DESPACHO Y SIDE CONTENT ---

    public onToggleSideContent(): void {
        const oDSC = this.byId("DynamicSideContent") as any;
        const bIsShowing = oDSC.getShowSideContent();
        oDSC.setShowSideContent(!bIsShowing);

        setTimeout(() => {
            if (this._map) window.google.maps.event.trigger(this._map, "resize");
        }, 600);
    }

    public onOpenCPGrouping(): void {
        const oView = this.getView();
        const oModel = oView?.getModel("localModel") as JSONModel;
        if (!oModel) return;

        let aServiciosParaTabla: any[] = oModel.getProperty("/ServiciosPendientes") || [];
        const aMecanicos = oModel.getProperty("/Mecanicos") || [];

        aMecanicos.forEach((oMec: any) => {
            if (oMec.Citas && oMec.Citas.length > 0) {
                oMec.Citas.forEach((oCita: any) => {
                    const bExiste = aServiciosParaTabla.some((s: any) => s.Id === oCita.Id);
                    if (!bExiste) {
                        aServiciosParaTabla.push({
                            Id: oCita.Id, Equipo: oCita.title, Cliente: oCita.text,
                            Lat: oCita.Lat, Lng: oCita.Lng, CP: oCita.CP,
                            MecanicoAsignadoId: oMec.Id
                        });
                    }
                });
                oMec.Citas = [];
            }
        });

        oModel.setProperty("/ServiciosPendientes", aServiciosParaTabla);
        oModel.refresh(true);
        this.onToggleSideContent();
    }

public onMecanicoChange(oEvent: any): void {
        const oView = this.getView();
        const oModel = oView?.getModel("localModel") as JSONModel;
        if (!oModel) return;

        // --- 1. Feedback Inmediato de Fecha (Motor de Frecuencias) ---
        const oSelect = oEvent.getSource();
        const oItemContext = oSelect.getBindingContext("localModel");
        
        // ¡IMPORTANTE! TS necesita saber que getObject() no es null
        const oServicioActual = oItemContext?.getObject();
        if (!oServicioActual) return;

        const sSelectedMecanicoId = oSelect.getSelectedKey();
        
        // Obtenemos la fecha actual del calendario para saber el mes de planificación
        const oCalendar = this.byId("calendarMonthly") as any;
        const oCurrentDate = oCalendar?.getStartDate() || new Date();

        if (sSelectedMecanicoId) {
            // Calculamos la fecha sugerida AL INSTANTE
            // Asegúrate de tener implementada la función _calculateServiceDate que definimos antes
            const dFechaCalculada = this._calculateServiceDate(
                oServicioActual.Frecuencia, 
                oCurrentDate.getFullYear(), 
                oCurrentDate.getMonth()
            );
            
            // Actualizamos la propiedad directamente en el objeto del modelo
            oModel.setProperty(oItemContext.getPath() + "/FechaSugerida", dFechaCalculada);
            
            // Feedback visual rápido
            const sFechaLegible = dFechaCalculada.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            MessageToast.show(`Sugerido para: ${sFechaLegible}`);
        } else {
            // Si deseleccionan, limpiamos la fecha
            oModel.setProperty(oItemContext.getPath() + "/FechaSugerida", null);
        }

        // --- 2. SOLUCIÓN AL PROBLEMA DE DESAPARICIÓN DE EQUIPOS ---
        // El problema es que _simulateProfessionalRoutes o oModel.refresh(true) 
        // pueden romper el binding si no se manejan con cuidado.
        // Vamos a actualizar KPIs primero SIN hacer refresh global.

        this._updateKPIsOffline();

        // Llamamos a la simulación de rutas (con 'true' para optimizar)
        this._simulateProfessionalRoutes(true);

        // En lugar de oModel.refresh(true), forzamos actualización solo donde se necesita
        oModel.updateBindings(true); 
    }

    /**
     * Actualiza capacidades y barras de progreso sin romper el binding de la tabla
     */
    private _updateKPIsOffline(): void {
        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        if (!oModel) return;

        const aMecanicos = oModel.getProperty("/Mecanicos") || [];
        const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
        const iLimiteMaximo = 10; // Capacidad mensual

        aMecanicos.forEach((oMec: any) => {
            const iAsignados = aServicios.filter((s: any) => s.MecanicoAsignadoId === oMec.Id).length;
            
            const iPorcentaje = Math.min((iAsignados / iLimiteMaximo) * 100, 100);
            oMec.PorcentajeOcupacion = iPorcentaje;
            oMec.Disponible = iAsignados < iLimiteMaximo;

            // Semáforo
            if (iPorcentaje === 0) oMec.EstadoCarga = "None";
            else if (iPorcentaje < 50) oMec.EstadoCarga = "Success";
            else if (iPorcentaje < 90) oMec.EstadoCarga = "Warning";
            else oMec.EstadoCarga = "Error";
        });
    }
    public onConfirmAllAssignments(): void {
        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
        const aMecanicos = oModel.getProperty("/Mecanicos") || [];

        // Validación de asignación completa
        const aSinAsignar = aServicios.filter((s: any) => !s.MecanicoAsignadoId);
        if (aSinAsignar.length > 0) {
            MessageBox.confirm(`Faltan ${aSinAsignar.length} por asignar. ¿Continuar?`, {
                onClose: (oAction: any) => { if (oAction === MessageBox.Action.OK) this._processAndClose(); }
            });
        } else {
            this._processAndClose();
        }
    }

private _processAndClose(): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    let aCitasGlobales = oModel.getProperty("/CitasGlobales") || [];

    aServicios.forEach((s: any) => {
        if (s.MecanicoAsignadoId) {
            const oMec = aMecanicos.find((m: any) => m.Id === s.MecanicoAsignadoId);
            const dStart = s.FechaSugerida || new Date();
            const dEnd = new Date(dStart.getTime() + (2 * 60 * 60 * 1000));

            const oNuevaCita = {
                Id: s.Id,
                title: s.Equipo,
                text: s.Cliente,
                startDate: dStart,
                endDate: dEnd,
                Lat: s.Lat, Lng: s.Lng, CP: s.CP,
                type: oMec.Id === "M1" ? "Type01" : "Type08",
                icon: "sap-icon://wrench",
                editable: true,
    draggable: true,
    resizable: true
            };

            // 1. Agregar a la fila del mecánico (PlanningCalendar)
            if (oMec) {
                if (!oMec.Citas) oMec.Citas = [];
                oMec.Citas.push(oNuevaCita);
            }

            // 2. Agregar al global (SinglePlanningCalendar)
            // Agregamos el nombre del mecánico al título para la vista mensual
            aCitasGlobales.push({
                ...oNuevaCita,
                title: `${oMec.Nombre}: ${s.Equipo}` 
            });
        }
    });

    oModel.setProperty("/CitasGlobales", aCitasGlobales);
    oModel.setProperty("/ServiciosPendientes", aServicios.filter((s: any) => !s.MecanicoAsignadoId));
    
    this.onToggleSideContent();
    oModel.refresh(true);
    MessageToast.show("Calendarios actualizados");
}




    // --- UTILIDADES ---

    private _formatSeconds(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    public onNavBack(): void {
        const oHistory = History.getInstance();
        if (oHistory.getPreviousHash() !== undefined) {
            window.history.go(-1);
        } else {
            UIComponent.getRouterFor(this).navTo("RouteMain", {}, true);
        }
    }

    public onAppointmentDrop(oEvent: any): void {
    const oAppointment = oEvent.getParameter("appointment");
    const dStartDate = oEvent.getParameter("startDate");
    const dEndDate = oEvent.getParameter("endDate");
    const oModel = this.getView()?.getModel("localModel") as JSONModel;

    if (!oAppointment || !dStartDate) return;

    // 1. Obtener el objeto de la cita y su ruta en el modelo
    const oContext = oAppointment.getBindingContext("localModel");
    const sPath = oContext.getPath();

    // 2. Actualizar las fechas en el modelo
    oModel.setProperty(sPath + "/startDate", dStartDate);
    oModel.setProperty(sPath + "/endDate", dEndDate);

    // 3. Si el movimiento fue en el PlanningCalendar (por filas), 
    // verificamos si se movió a otro mecánico (otra fila)
    const oTargetRow = oEvent.getParameter("calendarRow");
    if (oTargetRow) {
        const sNewMecanicoPath = oTargetRow.getBindingContext("localModel").getPath();
        const oNewMecanico = oModel.getProperty(sNewMecanicoPath);
        
        // Aquí podrías mover el objeto de la lista de citas de un mecánico a otro si fuera necesario
        MessageToast.show(`Reasignado a ${oNewMecanico.Nombre} el ${dStartDate.toLocaleDateString()}`);
    } else {
        MessageToast.show(`Fecha cambiada al ${dStartDate.toLocaleDateString()}`);
    }

    // 4. Sincronizar con el calendario Mensual (CitasGlobales)
    this._syncGlobalAppointments();

    // 5. Recalcular rutas en el mapa por si el orden cambió
    this._simulateProfessionalRoutes(true);
    
    oModel.refresh(true);
}

/**
 * Mantiene el calendario de "mano" sincronizado con los datos de los mecánicos
 */
/**
 * Mantiene el calendario de "Vista Mensual" sincronizado con los datos de los mecánicos
 */
private _syncGlobalAppointments(): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    if (!oModel) return;

    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    let aCitasTemporales: any[] = [];

    aMecanicos.forEach((oMec: any) => {
        if (oMec.Citas && oMec.Citas.length > 0) {
            oMec.Citas.forEach((oCita: any) => {
                const oNuevaCita = JSON.parse(JSON.stringify(oCita));
                
                // --- LA CORRECCIÓN ESTÁ AQUÍ ---
                // Inyectamos el ID o Nombre del mecánico en la cita clonada
                oNuevaCita.MecanicoAsignadoId = oMec.Id || oMec.Nombre; 
                
                oNuevaCita.startDate = new Date(oCita.startDate);
                oNuevaCita.endDate = new Date(oCita.endDate);
                oNuevaCita.title = `${oMec.Nombre}: ${oCita.title || oCita.Equipo}`;
                
                aCitasTemporales.push(oNuevaCita);
            });
        }
    });

    oModel.setProperty("/FilaMensualGlobal", [{
        Nombre: "Planificación General",
        Citas: aCitasTemporales
    }]);

    oModel.updateBindings(true);
}



private _filterRouteByService(oTargetService: any): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];

    const sNombreBuscado = oTargetService.title.split(":")[0].trim();
    const oMecanicoDuenio = aMecanicos.find((m: any) => m.Nombre === sNombreBuscado);

    if (!oMecanicoDuenio) return;

    if (this._polylines) {
        this._polylines.forEach((p: any) => p.setMap(null));
    }
    this._polylines = [];

    const dFechaSeleccionada = new Date(oTargetService.startDate).toDateString();
    
    // PASAMOS EL COLOR: Usamos el color del objeto mecánico encontrado
    const sColorRuta = oMecanicoDuenio.Color || "#3f51b5"; 

    console.log(`Dibujando ruta ${sColorRuta} para: ${oMecanicoDuenio.Nombre}`);
    
    // Enviamos el color como tercer parámetro
    this._drawSingleMecanicoRoute(oMecanicoDuenio, dFechaSeleccionada, sColorRuta);
}




private _drawSingleMecanicoRoute(oMec: any, sFechaFiltro: string, sColor: string): void {
    if (!this._map || !oMec.Citas) return;

    const aPathCoords: any[] = [];
    aPathCoords.push(this._baseCoords || this.BASE_COORDS);

    oMec.Citas.forEach((cita: any) => {
        const dFechaCita = new Date(cita.startDate).toDateString();
        if (dFechaCita === sFechaFiltro && cita.Lat && cita.Lng) {
            aPathCoords.push({
                lat: parseFloat(cita.Lat),
                lng: parseFloat(cita.Lng)
            });
        }
    });

    if (aPathCoords.length > 1) {
        const oPolyline = new window.google.maps.Polyline({
            path: aPathCoords,
            geodesic: true,
            strokeColor: sColor, // <--- AQUÍ usamos el color que pasamos
            strokeOpacity: 1.0,
            strokeWeight: 6,
            map: this._map
        });
        this._polylines.push(oPolyline);
    }
}




/**
 * Enfoca el mapa en las coordenadas del servicio y hace que el marcador rebote
 * @param oContext Datos del servicio seleccionado
 */
private _focusMarkerAndZoom(oContext: any): void {
    if (!this._map || !oContext.Lat || !oContext.Lng) {
        return;
    }

    const sClienteBuscado = oContext.title || oContext.Cliente;
    const fLat = parseFloat(oContext.Lat);
    const fLng = parseFloat(oContext.Lng);

    // 1. Zoom y centrado suave
    this._map.setZoom(16);
    this._map.panTo({ lat: fLat, lng: fLng });

    // 2. Animación del marcador
    // Buscamos en el arreglo de marcadores que ya tienes creados
    const oMarker = this._markers.find(m => m.getTitle() === sClienteBuscado);
    
    if (oMarker) {
        oMarker.setAnimation(window.google.maps.Animation.BOUNCE);
        // Quitamos la animación después de 2 segundos para no agobiar la vista
        setTimeout(() => oMarker.setAnimation(null), 2000);
    }

    MessageToast.show(`Localizando: ${sClienteBuscado}`);
}


/**
 * Limpia los filtros y vuelve a dibujar las rutas de todos los mecánicos
 */
public onClearRouteFilter(): void {
    // Limpiar polilíneas del mapa físicamente
    if (this._polylines) {
        this._polylines.forEach((p: any) => p.setMap(null));
        this._polylines = []; 
    }
    
    // Volver a dibujar todo el set global
    this._simulateProfessionalRoutes(true);
    MessageToast.show("Filtros limpiados");
}

/**
 * Ajusta el mapa para que todos los marcadores sean visibles
 */
private _fitMapToAllMarkers(): void {
    if (!this._markers || this._markers.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    this._markers.forEach((marker: any) => bounds.extend(marker.getPosition()));
    this._map.fitBounds(bounds);
}


/**
 * Dibuja el marcador especial de la Base Operativa
 * @param oCoords Coordenadas de la base {lat, lng}
 */
private _drawBaseMarker(oCoords: { lat: number, lng: number }): void {
    // Si por alguna razón oCoords llega nulo, usamos el respaldo
    const oPos = oCoords || this.BASE_COORDS;

    if (!this._map) return;

    const oBaseMarker = new window.google.maps.Marker({
        position: oPos,
        map: this._map,
        title: "CENTRO INDUSTRIAL TLALNEPANTLA - BASE",
        icon: {
            // Usamos un símbolo de "Casa" o "Tienda" para que se vea diferente a los pins redondos
            path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z", // Path SVG de una casa
            scale: 1.5,
            fillColor: "#000000", // Negro sólido
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#FFFFFF",
            anchor: new window.google.maps.Point(12, 12)
        },
        zIndex: 1000
    });

    // Añadimos un InfoWindow para que al hacer clic se vea la dirección oficial
    const infoWindow = new window.google.maps.InfoWindow({
        content: `
            <div style="padding:5px;">
                <b style="color:#3f51b5;">Base Operativa</b><br/>
                Calle Mariano Escobedo 69<br/>
                Centro Industrial Tlalnepantla
            </div>`
    });

    oBaseMarker.addListener("click", () => {
        infoWindow.open(this._map, oBaseMarker);
    });
}

}

declare global { interface Window { google: any; } }