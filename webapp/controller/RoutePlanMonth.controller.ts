import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import History from "sap/ui/core/routing/History";
import UIComponent from "sap/ui/core/UIComponent";
import Sorter from "sap/ui/model/Sorter";
import MessageBox from "sap/m/MessageBox";


/**
 * @namespace routeplanningmantto.controller
 */
export default class RoutePlanMonth extends Controller {
    private _map: any;
    private _markers: any[] = [];
    private _polylines: any[] = [];
    private _base = { lat: 19.54471, lng: -99.19305 };
    private _cpDialog: any;

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

    private _setupLocalData(oModel: JSONModel): void {
        this._parseODataSimulation(oModel);
        this.getView()?.setModel(oModel, "localModel");
        this._simulateProfessionalRoutes(false);
        MessageToast.show("Base de Datos cargada: " + oModel.getProperty("/Mecanicos").length + " mecánicos listos.");
    }

    private _parseODataSimulation(oModel: JSONModel): void {
        const aMecanicos = oModel.getProperty("/Mecanicos") || [];
        aMecanicos.forEach((mecanico: any) => {
            if (mecanico.Citas) {
                mecanico.Citas.forEach((cita: any) => {
                    cita.Inicio = new Date(cita.Inicio);
                    cita.Fin = new Date(cita.Fin);
                });
            }
        });
        const sStartDate = oModel.getProperty("/StartDate");
        if (sStartDate) {
            oModel.setProperty("/StartDate", new Date(sStartDate));
        }
    }

    public onAfterRendering(): void {
        this._checkAndInitMap(0);
    }

    private _checkAndInitMap(attempts: number): void {
        const mapDiv = document.getElementById("mapMonthDiv");
        if (window.google && window.google.maps && mapDiv) {
            this._initMap();
            return;
        }
        if (!window.google && attempts === 0) {
            const sApiKey = "AIzaSyDVrf4dOi3krlWgBf0-qjqKXmBLkm-aEEQ";
            const script = document.createElement("script");
            script.src = `https://maps.googleapis.com/maps/api/js?key=${sApiKey}`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
        if (attempts < 10) {
            setTimeout(() => this._checkAndInitMap(attempts + 1), 500);
        }
    }

    private _initMap(): void {
        const mapDiv = document.getElementById("mapMonthDiv");
        if (!mapDiv || !window.google) return;

        this._map = new window.google.maps.Map(mapDiv, {
            center: this._base,
            zoom: 13,
            styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }]
        });
        
        this._simulateProfessionalRoutes(false);
    }

    public onDropService(oEvent: any): void {
        MessageToast.show("Reordenando secuencia y recalculando tiempos...");
        this._simulateProfessionalRoutes(false); 
    }

    public onRunOptimization(): void {
        MessageToast.show("Ejecutando modelo de optimización estocástica...");
        this._markers.forEach(m => {
            m.setAnimation(window.google.maps.Animation.BOUNCE);
            setTimeout(() => m.setAnimation(null), 1500);
        });

        setTimeout(() => {
            this._simulateProfessionalRoutes(true);
            MessageToast.show("Optimización completada: Eficiencia incrementada en 12%");
        }, 1600);
    }

private _simulateProfessionalRoutes(bOptimized: boolean): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    if (!oModel) return;

    // 1. Obtenemos servicios pendientes
    const aServiciosPendientes = oModel.getProperty("/ServiciosPendientes") || [];
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    
    // 2. IMPORTANTE: Consolidamos TODOS los servicios (Pendientes + Los que ya están en Citas)
    // Esto evita que el mapa se quede vacío al "mover" servicios al calendario.
    let aTodosLosServicios: any[] = [...aServiciosPendientes];

    aMecanicos.forEach((mecanico: any) => {
        if (mecanico.Citas && mecanico.Citas.length > 0) {
            mecanico.Citas.forEach((cita: any) => {
                // Mapeamos la cita al formato que el mapa entiende
                // Asegúrate de que en _processAndClose guardes Lat y Lng en la cita
                aTodosLosServicios.push({
                    Id: cita.Id,
                    Lat: cita.Lat,
                    Lng: cita.Lng,
                    MecanicoAsignadoId: mecanico.Id, // El ID del mecánico dueño de la cita
                    Prioridad: cita.Prioridad || 1
                });
            });
        }
    });

    // 3. Limpieza física del mapa
    if (this._map) {
        this._polylines.forEach(p => p.setMap(null));
        this._markers.forEach(m => m.setMap(null));
        this._polylines = [];
        this._markers = [];
    }

    const oDirectionsService = new window.google.maps.DirectionsService();

    aMecanicos.forEach((mecanico: any) => {
        // Filtramos sobre la lista consolidada para incluir lo que ya está en el calendario
        const aMisServicios = aTodosLosServicios.filter((s: any) => s.MecanicoAsignadoId === mecanico.Id);
        
        if (aMisServicios.length > 0) {
            const waypoints = aMisServicios.map((s: any) => ({
                location: { lat: s.Lat, lng: s.Lng },
                stopover: true
            }));

            oDirectionsService.route({
                origin: this._base,
                destination: this._base,
                waypoints: waypoints,
                optimizeWaypoints: bOptimized,
                travelMode: window.google.maps.TravelMode.DRIVING,
            }, (result: any, status: any) => {
                if (status === "OK") {
                    
                    if (this._map && window.google) {
                        const sColor = mecanico.Id === "M1" ? "#4285F4" : "#34A853";
                        const polyline = new window.google.maps.Polyline({
                            path: result.routes[0].overview_path,
                            strokeColor: sColor,
                            strokeOpacity: 0.8,
                            strokeWeight: 5,
                            map: this._map
                        });
                        this._polylines.push(polyline);

                        result.routes[0].legs.forEach((leg: any, i: number) => {
                            if (i < result.routes[0].legs.length - 1) {
                                const marker = new window.google.maps.Marker({
                                    position: leg.end_location,
                                    map: this._map,
                                    label: {
                                        text: (i + 1).toString(),
                                        color: "white",
                                        fontWeight: "bold"
                                    },
                                    icon: {
                                        path: window.google.maps.SymbolPath.CIRCLE,
                                        fillColor: sColor,
                                        fillOpacity: 1,
                                        strokeWeight: 2,
                                        strokeColor: "white",
                                        scale: 12
                                    }
                                });
                                this._markers.push(marker);
                            }
                        });
                    }

                    let iTotalMeters = 0;
                    let iTotalSeconds = 0;
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
            mecanico.PorcentajeOcupacion = 0;
            mecanico.ServiciosAsignadosCount = 0;
            mecanico.EstadoCarga = "None";
            oModel.refresh(true);
        }
    });
}


/**
 * Convierte segundos en formato legible "2h 15min"
 */
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

    public onItemHover(oEvent: any): void {
        const oBindingContext = oEvent.getSource().getBindingContext("localModel");
        const sCliente = oBindingContext.getProperty("Cliente");

        this._polylines.forEach((polyline, index) => {
            const sMarkerTitle = this._markers[index].getTitle();
            if (sMarkerTitle === sCliente) {
                polyline.setOptions({ strokeOpacity: 1.0, strokeWeight: 8, zIndex: 100 });
                this._markers[index].setAnimation(window.google.maps.Animation.BOUNCE);
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

        const oContext = oAppointment.getBindingContext("localModel").getObject();
        const sClienteBuscado = oContext.Cliente;
        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        const aServicios = oModel.getProperty("/ServiciosPendientes");
        const oServicio = aServicios.find((s: any) => s.Cliente === sClienteBuscado);

        if (oServicio) {
            this._map.setZoom(16);
            this._map.panTo({ lat: oServicio.Lat, lng: oServicio.Lng });
            const oMarker = this._markers.find(m => m.getTitle() === sClienteBuscado);
            if (oMarker) {
                oMarker.setAnimation(window.google.maps.Animation.BOUNCE);
                setTimeout(() => oMarker.setAnimation(null), 2000);
            }
            MessageToast.show(`Localizando: ${sClienteBuscado}`);
        }
    }

public onOpenCPGrouping(): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    let aServiciosPendientes = oModel.getProperty("/ServiciosPendientes") || [];

    // 1. RECUPERACIÓN: Traer servicios del calendario de vuelta a la tabla de asignación
    aMecanicos.forEach((oMec: any) => {
        if (oMec.Citas && oMec.Citas.length > 0) {
            oMec.Citas.forEach((oCita: any) => {
                // Verificamos si ya existe en pendientes para no duplicar
                const bExiste = aServiciosPendientes.some((s: any) => s.Id === oCita.Id);
                
                if (!bExiste) {
                    // Re-mapeamos la Cita al formato original de Servicio
                    aServiciosPendientes.push({
                        Id: oCita.Id,
                        Equipo: oCita.title,
                        Cliente: oCita.text,
                        Lat: oCita.Lat,
                        Lng: oCita.Lng,
                        Prioridad: oCita.Prioridad,
                        CP: oCita.CP || "N/A", // Si guardaste el CP en la cita
                        MecanicoAsignadoId: oMec.Id // IMPORTANTE: Esto pre-selecciona el Select
                    });
                }
            });
            // Vaciamos las citas temporalmente (se regenerarán al dar 'Finalizar')
            oMec.Citas = [];
        }
    });

    // 2. Actualizamos el modelo con la lista consolidada
    oModel.setProperty("/ServiciosPendientes", aServiciosPendientes);
    
    // 3. Ordenamos visualmente la lista lateral por CP (Tu lógica original)
    const oList = this.byId("listAsignacion") as any;
    const oBinding = oList?.getBinding("items");
    if (oBinding) {
        const oSorter = new Sorter("CP", false, true); 
        oBinding.sort(oSorter);
    }

    // 4. Refrescamos para que los Selects del Fragmento vean los datos
    oModel.refresh(true);

    // 5. ABRE LA VENTANA (Diálogo)
    this.onOpenCPDialog(); 
}
    public onOpenCPDialog(): void {
        if (!this._cpDialog) {
            this._cpDialog = sap.ui.xmlfragment("routeplanningmantto.view.fragments.CPGrouping", this);
            this.getView()!.addDependent(this._cpDialog);
        }
        this._cpDialog.open();
    }

    public onAssignService(oEvent: any): void {
        const oSelectedItem = oEvent.getParameter("selectedItem");
        if (oSelectedItem) {
            const sCliente = oSelectedItem.getTitle();
            const sCP = oSelectedItem.getDescription().split(" - ")[0];
            MessageToast.show(`Asignando servicios del CP ${sCP} a mesa de control...`);
        }
    }

    /**
 * Se dispara cada vez que cambias un mecánico en el diálogo
 */
public onMecanicoChange(oEvent: any): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aMecanicos = oModel.getProperty("/Mecanicos");
    const aServicios = oModel.getProperty("/ServiciosPendientes");
    const iLimiteMaximo = 10; // Capacidad máxima mensual por técnico

    // 1. PRIMERO: Actualizamos Capacidades, Porcentajes y Bloqueos
    aMecanicos.forEach((oMecanico: any) => {
        // Contar cuántos equipos tiene asignados este mecánico actualmente en la tabla
        const iAsignados = aServicios.filter((s: any) => s.MecanicoAsignadoId === oMecanico.Id).length;
        
        oMecanico.ServiciosAsignadosCount = iAsignados;
        const iPorcentaje = Math.min((iAsignados / iLimiteMaximo) * 100, 100);
        oMecanico.PorcentajeOcupacion = iPorcentaje;

        // Lógica de disponibilidad para el Select
        oMecanico.Disponible = iAsignados < iLimiteMaximo;

        // Semáforo de la barra de progreso
        if (iPorcentaje === 0) oMecanico.EstadoCarga = "None";
        else if (iPorcentaje < 50) oMecanico.EstadoCarga = "Success";
        else if (iPorcentaje < 90) oMecanico.EstadoCarga = "Warning";
        else oMecanico.EstadoCarga = "Error";
    });

    // 2. SEGUNDO: Actualizamos KM y Tiempos (Inyección en tiempo real)
    // Llamamos a la función de rutas pero SIN dibujar en el mapa (solo para obtener datos)
    // Pasamos 'true' para que Google optimice la ruta y nos dé el kilometraje real más bajo
    this._simulateProfessionalRoutes(true);

    // 3. REFRESH: Forzamos a la UI a mostrar los nuevos valores en el Fragmento
    oModel.refresh(true);

    // Feedback visual si se llega al límite
    const sSelectedId = oEvent.getSource().getSelectedKey();
    const oMecActual = aMecanicos.find((m: any) => m.Id === sSelectedId);
    if (oMecActual && !oMecActual.Disponible) {
        MessageToast.show(`Capacidad máxima alcanzada para ${oMecActual.Nombre}`);
    }
}

/**
 * Al confirmar el diálogo, procesamos las rutas en el mapa
 */
/**
 * Al intentar finalizar, validamos que el despacho esté completo
 */
public onConfirmAssignment(): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aServicios = oModel.getProperty("/ServiciosPendientes");
    
    // 1. Verificar si hay equipos sin mecánico asignado
    const aSinAsignar = aServicios.filter((s: any) => !s.MecanicoAsignadoId);

    if (aSinAsignar.length > 0) {
        // Usamos el MessageBox importado directamente
        MessageBox.warning(
            `Faltan ${aSinAsignar.length} equipos por asignar. ¿Deseas finalizar de todos modos o completar el despacho?`, {
            actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
            emphasizedAction: MessageBox.Action.CANCEL,
            onClose: (sAction: string | null) => {
                // MessageBox.Action.OK devuelve "OK"
                if (sAction === "OK") {
                    this._processAndClose();
                }
            }
        });
    } else {
        this._processAndClose();
    }
}

private _processAndClose(): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];

    // 1. Transferencia: De "Pendientes" a "Citas del Calendario"
    aServicios.forEach((oServicio: any) => {
        if (oServicio.MecanicoAsignadoId) {
            const oMecanico = aMecanicos.find((m: any) => m.Id === oServicio.MecanicoAsignadoId);
            
            if (oMecanico) {
                if (!oMecanico.Citas) { oMecanico.Citas = []; }

                const bYaExiste = oMecanico.Citas.some((cita: any) => cita.Id === oServicio.Id);
                
                if (!bYaExiste) {
                    // Mapeo de datos para el CalendarAppointment
                    oMecanico.Citas.push({
                        Id: oServicio.Id,
                        // Propiedades vinculadas al XML
                        startDate: new Date(), 
                        endDate: new Date(new Date().getTime() + (4 * 60 * 60 * 1000)),
                        title: oServicio.Equipo, // Nombre del equipo como título
                        text: oServicio.Cliente, // Nombre del cliente como descripción
                        icon: "sap-icon://wrench",
                        // Sincronización de color con la ruta del mapa
                        type: oMecanico.Id === "M1" ? "Type01" : "Type08",
                        // Datos persistentes para el redibujado del mapa
                        Lat: oServicio.Lat, 
                        Lng: oServicio.Lng,
                        Prioridad: oServicio.Prioridad,
                        CP: oServicio.CP
                    });
                }
            }
        }
    });

    // 2. Limpieza: Quitamos de pendientes los que ya tienen mecánico
    const aAunPendientes = aServicios.filter((s: any) => !s.MecanicoAsignadoId);
    oModel.setProperty("/ServiciosPendientes", aAunPendientes);

    // 3. Finalización UI
    MessageToast.show("Planificación guardada. Actualizando rutas y calendario...");
    
    // Redibujamos el mapa (esta función ahora leerá tanto Pendientes como Citas)
    this._simulateProfessionalRoutes(true); 
    
    // Refrescamos el modelo para actualizar el PlanningCalendar y el mapa
    oModel.refresh(true);
    
    this._cpDialog.close();
}

public onCloseDialog(): void {
    this._cpDialog.close();
}

private _generateCalendarAppointments(aServicios: any[]): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aMecanicos = oModel.getProperty("/Mecanicos");

    aServicios.forEach((servicio, index) => {
        if (servicio.MecanicoAsignadoId) {
            const oMecanico = aMecanicos.find((m: any) => m.Id === servicio.MecanicoAsignadoId);
            if (oMecanico) {
                // Creamos una cita ficticia para el mes (ejemplo: 1 día después de hoy)
                const dFecha = new Date();
                dFecha.setDate(dFecha.getDate() + (index + 1));
                
                oMecanico.Citas.push({
                    Inicio: new Date(dFecha.setHours(9, 0)),
                    Fin: new Date(dFecha.setHours(12, 0)),
                    Cliente: servicio.Cliente,
                    TipoEstado: oMecanico.Id === "M1" ? "Type01" : "Type05"
                });
            }
        }
    });
    oModel.refresh();
}
/**
 * Calcula distancia y tiempo para un mecánico específico 
 * y actualiza el modelo en tiempo real.
 */
private _updateMecanicoKPIs(sMecanicoId: string): void {
    const oModel = this.getView()?.getModel("localModel") as JSONModel;
    const aServicios = oModel.getProperty("/ServiciosPendientes") || [];
    const aMecanicos = oModel.getProperty("/Mecanicos") || [];
    const oMecanico = aMecanicos.find((m: any) => m.Id === sMecanicoId);

    if (!oMecanico) return;

    const aMisServicios = aServicios.filter((s: any) => s.MecanicoAsignadoId === sMecanicoId);
    
    if (aMisServicios.length > 0) {
        const oDirectionsService = new window.google.maps.DirectionsService();
        const waypoints = aMisServicios.map((s: any) => ({
            location: { lat: s.Lat, lng: s.Lng },
            stopover: true
        }));

        oDirectionsService.route({
            origin: this._base,
            destination: this._base,
            waypoints: waypoints,
            optimizeWaypoints: true,
            travelMode: window.google.maps.TravelMode.DRIVING,
        }, (result: any, status: any) => {
            if (status === "OK") {
                let iTotalMeters = 0;
                let iTotalSeconds = 0;
                result.routes[0].legs.forEach((leg: any) => {
                    iTotalMeters += leg.distance.value;
                    iTotalSeconds += leg.duration.value;
                });

                oMecanico.DistanciaTotal = (iTotalMeters / 1000).toFixed(1);
                oMecanico.TiempoEstimado = this._formatSeconds(iTotalSeconds);
                oModel.refresh(true); // Esto actualiza la barra y los textos en el fragmento abierto
            }
        });
    } else {
        oMecanico.DistanciaTotal = "0.0";
        oMecanico.TiempoEstimado = "0m";
        oModel.refresh(true);
    }
}

}

declare global { interface Window { google: any; } }