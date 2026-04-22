import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import ToolPage from "sap/tnt/ToolPage";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import BindingMode from "sap/ui/model/BindingMode";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

/**
 * @namespace routeplanningmantto.controller
 */
export default class Main extends Controller {
    private _map: any;
    private _markers: any[] = [];
    private _polylines: any[] = [];
    private _baseLocation = { lat: 19.54471, lng: -99.19305 };
    private _oDialog: any;

    public onInit(): void {
        const oData = {
            intervenciones: [
                { 
                    nombre: "Julia Virmond | AS-987-WX", 
                    unidad: "1.2 km", 
                    estado: "EN PROCESO", 
                    state: "Warning",
                    pos: { lat: 19.5480, lng: -99.1990 } 
                },
                { 
                    nombre: "Paul Wagner | 76-UYG-09", 
                    unidad: "2.5 km", 
                    estado: "EN PROCESO", 
                    state: "Warning",
                    pos: { lat: 19.5390, lng: -99.1850 } 
                },
                { 
                    nombre: "Pierre Patel", 
                    unidad: "Disponible", 
                    estado: "DISPONIBLE", 
                    state: "Success",
                    pos: { lat: 19.5550, lng: -99.1910 } 
                }
            ]
        };
        this.getView()?.setModel(new JSONModel(oData), "localModel");
    }

    public onAfterRendering(): void {
        this._loadGoogleMaps();
    }

    private _loadGoogleMaps(): void {
        if (window.google && window.google.maps) {
            this._initMap();
            return;
        }
        const sApiKey = "AIzaSyDVrf4dOi3krlWgBf0-qjqKXmBLkm-aEEQ"; 
        (window as any).initMap = this._initMap.bind(this);

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${sApiKey}&callback=initMap`;
        script.async = true;
        document.head.appendChild(script);
    }

    private _initMap(): void {
        const mapElement = document.getElementById("googleMap");
        if (!mapElement) return;

        this._map = new window.google.maps.Map(mapElement, {
            center: this._baseLocation,
            zoom: 14,
            mapId: "DEMO_MAP_ID"
        });

        // Marcador de la Base
        const oBaseMarker = new window.google.maps.Marker({
            position: this._baseLocation,
            map: this._map,
            title: "Base Principal Tlalnepantla",
            icon: {
                url: "http://maps.google.com/mapfiles/kml/pal2/icon5.png", // Icono Almacén
                scaledSize: new window.google.maps.Size(40, 40)
            }
        });

        this._renderIntervenciones();
    }

    private _renderIntervenciones(): void {
        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        const aIntervenciones = oModel.getProperty("/intervenciones");

        aIntervenciones.forEach((item: any) => {
            const marker = new window.google.maps.Marker({
                position: item.pos,
                map: this._map,
                title: item.nombre,
                icon: item.state === "Success" ? 
                    "http://maps.google.com/mapfiles/ms/icons/green-dot.png" : 
                    "http://maps.google.com/mapfiles/ms/icons/orange-dot.png"
            });

            const info = new window.google.maps.InfoWindow({
                content: `<b>${item.nombre}</b><br/>Estado: ${item.estado}`
            });

            marker.addListener("click", () => info.open(this._map, marker));
            this._markers.push(marker);
        });
    }

    public onAnalizar(): void {
        // Limpiar rutas previas
        this._polylines.forEach(p => p.setMap(null));
        this._polylines = [];

        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        const aIntervenciones = oModel.getProperty("/intervenciones");

        aIntervenciones.forEach((item: any) => {
            const routePath = new window.google.maps.Polyline({
                path: [this._baseLocation, item.pos],
                geodesic: true,
                strokeColor: item.state === "Success" ? "#2B7D2B" : "#E66000",
                strokeOpacity: 0.6,
                strokeWeight: 3,
                map: this._map
            });
            this._polylines.push(routePath);
        });

        MessageToast.show("Rutas de salida visualizadas desde Base.");
    }

    public onSideNavButtonPress(): void {
        const oToolPage = this.byId("toolPage") as ToolPage;
        oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
    }

    /**
     * Al hacer clic en un técnico de la lista lateral
     */
    public onIntervencionPress(oEvent: any): void {
        const oBindingContext = oEvent.getSource().getBindingContext("localModel");
        const oData = oBindingContext.getObject();

        if (this._map && oData.pos) {
            // Mueve el mapa a la posición del técnico
            this._map.panTo(oData.pos);
            this._map.setZoom(16); // Zoom de detalle

            MessageToast.show("Enfocando a: " + oData.nombre);
            
            // Opcional: Buscar el marcador correspondiente y animarlo
            const oMarker = this._markers.find(m => 
                m.getPosition().lat().toFixed(4) === oData.pos.lat.toFixed(4)
            );
            if (oMarker) {
                oMarker.setAnimation(window.google.maps.Animation.BOUNCE);
                setTimeout(() => oMarker.setAnimation(null), 2100); // Rebota por 2 segundos
            }
        }
    }

    /**
     * Función adicional para regresar a la vista general (Base)
     * Puedes llamarla desde el botón "Mapa" del menú lateral
     */
    public onCenterBase(): void {
        if (this._map) {
            this._map.panTo(this._baseLocation);
            this._map.setZoom(14);
        }
    }


    
    public async onProgramar(): Promise<void> {
        if (!this._oDialog) {
            // Importaciones dinámicas para mantener el tipado
            const Label = (await import("sap/m/Label")).default;
            const Input = (await import("sap/m/Input")).default;
            const VBox = (await import("sap/m/VBox")).default;
            const Button = (await import("sap/m/Button")).default;
            const Dialog = (await import("sap/m/Dialog")).default;

            // Creamos los labels sin la propiedad 'class' en el constructor
            const oLabelNombre = new Label({ text: "Nombre del Cliente/Técnico" });
            const oLabelLat = new Label({ text: "Latitud" });
            const oLabelLng = new Label({ text: "Longitud" });

            // Añadimos el margen usando el método oficial
            oLabelLat.addStyleClass("sapUiSmallMarginTop");
            oLabelLng.addStyleClass("sapUiSmallMarginTop");

            this._oDialog = new Dialog({
                title: "Programar Nueva Intervención",
                contentWidth: "400px",
                content: [
                    new VBox({
                        items: [
                            oLabelNombre,
                            new Input("inputNombre", { placeholder: "Ej. Roberto Gómez | Placas..." }),
                            oLabelLat,
                            new Input("inputLat", { type: "Number", value: "19.5400" }),
                            oLabelLng,
                            new Input("inputLng", { type: "Number", value: "-99.1900" })
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new Button({
                    text: "Guardar",
                    type: "Emphasized",
                    press: () => {
                        this._saveNewIntervencion();
                        this._oDialog.close();
                    }
                }),
                endButton: new Button({
                    text: "Cancelar",
                    press: () => this._oDialog.close()
                })
            });

            this.getView()?.addDependent(this._oDialog);
        }
        this._oDialog.open();
    }

    /**
     * Guarda los datos del formulario al modelo y actualiza el mapa
     */
    private _saveNewIntervencion(): void {
        const oInputNombre = sap.ui.getCore().byId("inputNombre") as Input;
        const oInputLat = sap.ui.getCore().byId("inputLat") as Input;
        const oInputLng = sap.ui.getCore().byId("inputLng") as Input;
        const sNombre = (sap.ui.getCore().byId("inputNombre") as any).getValue();
        const fLat = parseFloat((sap.ui.getCore().byId("inputLat") as any).getValue());
        const fLng = parseFloat((sap.ui.getCore().byId("inputLng") as any).getValue());

        if (!sNombre) {
            MessageToast.show("Por favor ingresa un nombre");
            return;
        }

        const oModel = this.getView()?.getModel("localModel") as JSONModel;
        const aIntervenciones = oModel.getProperty("/intervenciones");

        const oNewItem = {
            nombre: sNombre,
            unidad: "Nueva Parada",
            estado: "PENDIENTE",
            state: "None",
            pos: { lat: fLat, lng: fLng }
        };

        // Actualizar Modelo
        aIntervenciones.push(oNewItem);
        oModel.setProperty("/intervenciones", aIntervenciones);

        // Actualizar Mapa: Creamos el nuevo marcador
        const marker = new window.google.maps.Marker({
            position: oNewItem.pos,
            map: this._map,
            title: oNewItem.nombre,
            icon: "http://googleusercontent.com/maps.google.com/5", // Icono azul estándar
            animation: window.google.maps.Animation.DROP
        });

        this._markers.push(marker);
        this._map.panTo(oNewItem.pos);

        MessageToast.show("Nueva intervención programada correctamente");
    }

    public onProgramarMensual(): void {
    const oRouter = (this.getOwnerComponent() as any).getRouter();
    oRouter.navTo("RoutePlanMonth");
}

public onStrategicPlanningNav(): void {
    const oRouter = (this.getOwnerComponent() as any).getRouter();
    oRouter.navTo("RouteStrategicPlanning");
}
    public onOrganizar(): void { MessageToast.show("Abriendo módulo de Organización..."); }
    public onSeguir(): void { MessageToast.show("Modo Seguimiento activado"); }



// ... dentro de tu controlador

public testODataConnection(): void {
    const oComponent = this.getOwnerComponent();
    const oModel = oComponent?.getModel("db") as any;

    if (!oModel || typeof oModel.read !== "function") {
        console.error("El modelo 'db' no es un ODataModel válido.");
        return;
    }

    // 1. Definición del filtro para evitar el error 501
    const sMailFilter = "ldelacruz@melco.com.mx|032026";
    const aFilters = [
        new Filter("Mail", FilterOperator.EQ, sMailFilter)
    ];

    // 2. Log de la URI base
    console.log(">>> URI Base del Servicio:", oModel.sServiceUrl);
    
    BusyIndicator.show(0);

    oModel.read("/HeaderRouteSet", {
        filters: aFilters,
        urlParameters: {
            "$expand": "ServicesRouteSet,MechanicRouteSet"
        },
        success: (oData: any) => {
            BusyIndicator.hide();
            
            // LOG DE LA URI REAL (Solo visible si el servidor responde)
            console.log(">>> URL de la petición enviada a SAP: ", oModel.sServiceUrl + "/HeaderRouteSet?$filter=Mail eq '" + sMailFilter + "'&$expand=...");

            // 3. Procesamiento de los resultados del EntitySet
            if (oData && oData.results && oData.results.length > 0) {
                const oHeader = oData.results[0]; // Tomamos el primer resultado del filtro
                
                console.log("✅ RESULTADOS ODATA RECIBIDOS:");
                console.log("Header ID:", oHeader.Id);
                console.log("Mecánicos encontrados:", oHeader.MechanicRouteSet?.results?.length || 0);
                console.log("Servicios encontrados:", oHeader.ServicesRouteSet?.results?.length || 0);
                
                // Muestra la tabla de servicios en consola para validar campos
                console.table(oHeader.ServicesRouteSet.results);

                MessageBox.success("Datos cargados. Revisa la consola para ver la estructura de MechanicRouteSet y ServicesRouteSet.");
            } else {
                console.warn("⚠️ No se encontraron datos para el filtro proporcionado.");
                MessageToast.show("Sin resultados en SAP para este usuario/periodo.");
            }
        },
        error: (oError: any) => {
            BusyIndicator.hide();
            
            // Log de la URI que falló
            if (oError.requestUri) {
                console.error("❌ URI FALLIDA:", oError.requestUri);
            }
            
            console.error("❌ ERROR DETALLADO:", oError);
            MessageBox.error("Fallo en SAP: " + (oError.message || "Error desconocido"));
        }
    });
}


}

declare global { interface Window { google: any; initMap: any; } }