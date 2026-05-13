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
import Dialog from "sap/m/Dialog";
import Table from "sap/m/Table";
import ColumnListItem from "sap/m/ColumnListItem";
import Text from "sap/m/Text";
import Button from "sap/m/Button";
import ObjectStatus from "sap/m/ObjectStatus";



/**
 * @namespace routeplanningmantto.controller
 */
export default class Main extends Controller {
    private _map: any;
    private _markers: any[] = [];
    private _polylines: any[] = [];
    private _baseLocation = { lat: 19.54471, lng: -99.19305 };
    private _oDialog: any;
    private _oExpedienteDialog: any;
    private ZSD_CATALOGOS_SRV: ODataModel;
    private _oDetalleContratosDialog: any;
    private _pContractDetails: Promise<Dialog>;

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
        this.ZSD_CATALOGOS_SRV = this.getOwnerComponent()?.getModel("ZSD_CATALOGOS_SRV") as ODataModel
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

        const oBaseMarker = new window.google.maps.Marker({
            position: this._baseLocation,
            map: this._map,
            title: "Base Principal Tlalnepantla",
            icon: {
                url: "http://maps.google.com/mapfiles/kml/pal2/icon5.png",
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

    public onIntervencionPress(oEvent: any): void {
        const oBindingContext = oEvent.getSource().getBindingContext("localModel");
        const oData = oBindingContext.getObject();

        if (this._map && oData.pos) {
            this._map.panTo(oData.pos);
            this._map.setZoom(16);

            MessageToast.show("Enfocando a: " + oData.nombre);
            
            const oMarker = this._markers.find(m => 
                m.getPosition().lat().toFixed(4) === oData.pos.lat.toFixed(4)
            );
            if (oMarker) {
                oMarker.setAnimation(window.google.maps.Animation.BOUNCE);
                setTimeout(() => oMarker.setAnimation(null), 2100);
            }
        }
    }

    public onCenterBase(): void {
        if (this._map) {
            this._map.panTo(this._baseLocation);
            this._map.setZoom(14);
        }
    }

    public async onProgramar(): Promise<void> {
        if (!this._oDialog) {
            const Label = (await import("sap/m/Label")).default;
            const Input = (await import("sap/m/Input")).default;
            const VBox = (await import("sap/m/VBox")).default;
            const Button = (await import("sap/m/Button")).default;
            const Dialog = (await import("sap/m/Dialog")).default;

            const oLabelNombre = new Label({ text: "Nombre del Cliente/Técnico" });
            const oLabelLat = new Label({ text: "Latitud" });
            const oLabelLng = new Label({ text: "Longitud" });

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

    private _saveNewIntervencion(): void {
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

        aIntervenciones.push(oNewItem);
        oModel.setProperty("/intervenciones", aIntervenciones);

        const marker = new window.google.maps.Marker({
            position: oNewItem.pos,
            map: this._map,
            title: oNewItem.nombre,
            icon: "http://googleusercontent.com/maps.google.com/5",
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

    public testODataConnection(): void {
        const oComponent = this.getOwnerComponent();
        const oModel = oComponent?.getModel("db") as any;

        if (!oModel || typeof oModel.read !== "function") {
            console.error("El modelo 'db' no es un ODataModel válido.");
            return;
        }

        const sMailFilter = "ldelacruz@melco.com.mx|032026";
        const aFilters = [
            new Filter("Mail", FilterOperator.EQ, sMailFilter)
        ];
        
        BusyIndicator.show(0);

        oModel.read("/HeaderRouteSet", {
            filters: aFilters,
            urlParameters: {
                "$expand": "ServicesRouteSet,MechanicRouteSet"
            },
            success: (oData: any) => {
                BusyIndicator.hide();
                if (oData && oData.results && oData.results.length > 0) {
                    const oHeader = oData.results[0];
                    MessageBox.success("Datos cargados. Revisa la consola.");
                } else {
                    MessageToast.show("Sin resultados en SAP.");
                }
            },
            error: (oError: any) => {
                BusyIndicator.hide();
                MessageBox.error("Fallo en SAP: " + (oError.message || "Error desconocido"));
            }
        });
    }

    // --- MÉTODOS PARA EXPEDIENTE (ACCIONADOS DESDE SIDE NAV) ---
/*
    public async onOpenExpediente(): Promise<void> {
        if (!this._oExpedienteDialog) {
            const Dialog = (await import("sap/m/Dialog")).default;
            const VBox = (await import("sap/m/VBox")).default;
            const Label = (await import("sap/m/Label")).default;
            const Input = (await import("sap/m/Input")).default;
            const Button = (await import("sap/m/Button")).default;
            const Table = (await import("sap/m/Table")).default;
            const Column = (await import("sap/m/Column")).default;
            const Text = (await import("sap/m/Text")).default;

            const oLabelRFC = new Label({ text: "RFC" });
            const oLabelNombre = new Label({ text: "Nombre de Cliente" });
            // Corrección de error de TS: addStyleClass se usa fuera del constructor
            oLabelNombre.addStyleClass("sapUiSmallMarginTop");

            this._oExpedienteDialog = new Dialog({
                title: "Expediente de Cliente",
                contentWidth: "650px",
                content: [
                    new VBox({
                        items: [
                            oLabelRFC,
                            new Input("inputRFC", { placeholder: "XAXX010101000" }),
                            oLabelNombre,
                            new Input("inputClienteExp", { placeholder: "Nombre del titular..." }),
                            new Button({
                                text: "Buscar",
                                icon: "sap-icon://search",
                                type: "Emphasized",
                                press: () => this._onFakeSearch()
                            }).addStyleClass("sapUiSmallMarginTop"),
                            new Table("tableExpediente", {
                                visible: false,
                                columns: [
                                    new Column({ header: new Text({ text: "Contrato" }) }),
                                    new Column({ header: new Text({ text: "Equipos" }) }),
                                    new Column({ header: new Text({ text: "O. Planeadas" }) }),
                                    new Column({ header: new Text({ text: "O. Ejecución" }) })
                                ]
                            }).addStyleClass("sapUiSmallMarginTop")
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                endButton: new Button({
                    text: "Cerrar",
                    press: () => this._oExpedienteDialog.close()
                })
            });
            this.getView()?.addDependent(this._oExpedienteDialog);
        }
        this._oExpedienteDialog.open();
    }
*/




// --- MÉTODOS PARA EXPEDIENTE (Adaptados con lógica de onSearchCustomer) ---

public async onOpenExpediente(): Promise<void> {
    if (!this._oExpedienteDialog) {
        const Dialog = (await import("sap/m/Dialog")).default;
        const VBox = (await import("sap/m/VBox")).default;
        const Label = (await import("sap/m/Label")).default;
        const Input = (await import("sap/m/Input")).default;
        const Button = (await import("sap/m/Button")).default;
        const Table = (await import("sap/m/Table")).default;
        const Column = (await import("sap/m/Column")).default;
        const Text = (await import("sap/m/Text")).default;

        this._oExpedienteDialog = new Dialog({
            title: "Expediente de Cliente / Contratos",
            contentWidth: "700px",
            content: [
                new VBox({
                    items: [
                        new Label({ text: "Buscar por Contrato (Referencia Cliente)" }).addStyleClass("sapUiSmallMarginTop"),
                        new Input("inputContrato", { 
                            placeholder: "Ej: CMDF925-21...",
                            submit: () => this.onSearchExpediente() 
                        }),

                        new Label({ text: "Buscar por RFC / ID Cliente" }).addStyleClass("sapUiSmallMarginTop"),
                        new Input("inputRFC", { 
                            placeholder: "Escribe RFC o Código...",
                            submit: () => this.onSearchExpediente() 
                        }),

                        new Label({ text: "Nombre de Cliente" }).addStyleClass("sapUiSmallMarginTop"),
                        new Input("inputClienteExp", { 
                            placeholder: "Escribe nombre...",
                            submit: () => this.onSearchExpediente() 
                        }),

                        new Button({
                            text: "Buscar",
                            icon: "sap-icon://search",
                            type: "Emphasized",
                            press: () => this.onSearchExpediente()
                        }).addStyleClass("sapUiSmallMarginTop"),
                        
                        new Table("tableExpediente", {
                            visible: false,
                            mode: "SingleSelectMaster",
                            selectionChange: (oEvent: any) => this.onClienteSelected(oEvent),
                            columns: [
                                new Column({ header: new Text({ text: "Resultado (ID/Contrato)" }) }),
                                new Column({ header: new Text({ text: "Nombre / Razón Social" }) }),
                                new Column({ header: new Text({ text: "Referencia/RFC" }) })
                            ]
                        }).addStyleClass("sapUiSmallMarginTop")
                    ]
                }).addStyleClass("sapUiSmallMargin")
            ],
            endButton: new Button({
                text: "Cerrar",
                press: () => {
                    // 1. Limpiar valores de los inputs
                    (sap.ui.getCore().byId("inputContrato") as any).setValue("");
                    (sap.ui.getCore().byId("inputRFC") as any).setValue("");
                    (sap.ui.getCore().byId("inputClienteExp") as any).setValue("");

                    // 2. Ocultar tabla y limpiar su modelo para la próxima apertura
                    const oTable = sap.ui.getCore().byId("tableExpediente") as any;
                    if (oTable) {
                        oTable.setVisible(false);
                        if (oTable.getModel()) {
                            oTable.setModel(new JSONModel([]));
                        }
                    }

                    // 3. Cerrar el diálogo
                    this._oExpedienteDialog.close();
                }
            })
        });
        this.getView()?.addDependent(this._oExpedienteDialog);
    }
    this._oExpedienteDialog.open();
}





/**
 * Esta función toma la lógica exacta de onSearchCustomer 
 * pero aplicada al Input manual del Expediente.
 */
public onSearchExpediente(): void {
    const sContrato = (sap.ui.getCore().byId("inputContrato") as any).getValue();
    const sRFC = (sap.ui.getCore().byId("inputRFC") as any).getValue();
    const sNombre = (sap.ui.getCore().byId("inputClienteExp") as any).getValue();
    const oTable = sap.ui.getCore().byId("tableExpediente") as any;
    const oModel = this.getOwnerComponent()?.getModel("ZSD_CATALOGOS_SRV") as ODataModel;

    if (!oModel) return;

    let sEntitySet = "/CustomerSet";
    let aFilters: Filter[] = [];

    // Prioridad 1: Búsqueda por Contrato
    if (sContrato.trim().length > 0) {
        sEntitySet = "/SalesContractSet";
        aFilters.push(new Filter("Bstnk", FilterOperator.EQ, sContrato.trim()));
    } 
    // Prioridad 2: Búsqueda por Cliente/RFC
    else if (sRFC.trim().length >= 3 || sNombre.trim().length >= 3) {
        const sValue = sRFC || sNombre;
        aFilters.push(new Filter({
            filters: [
                new Filter("CustomerCode", FilterOperator.Contains, sValue),
                new Filter("Name1", FilterOperator.Contains, sValue),
                new Filter("RFC", FilterOperator.Contains, sValue)
            ],
            and: false
        }));
    } else {
        MessageToast.show("Ingresa al menos un criterio de búsqueda (mín. 3 caracteres).");
        return;
    }

    oTable.setBusy(true);

    oModel.read(sEntitySet, {
        filters: aFilters,
        success: (oData: any) => {
            oTable.setBusy(false);
            let aResults = oData?.results || [];
            
            // --- Lógica de Split para el campo Cliente ---
            aResults = aResults.map((item: any) => {
                if (item.Cliente && item.Cliente.includes("|")) {
                    const aParts = item.Cliente.split("|");
                    item.ClienteID = aParts[0].trim();
                    item.ClienteNombre = aParts[1].trim();
                } else {
                    item.ClienteID = item.CustomerCode || "";
                    item.ClienteNombre = item.Name1 || item.Ktext || "";
                }
                return item;
            });

            if (aResults.length > 0) {
                oTable.setModel(new JSONModel(aResults));
                oTable.bindItems({
                    path: "/",
                    template: new (sap.m as any).ColumnListItem({
                        type: "Active",
                        cells: [
                            // Columna 1: ID Contrato o ID Cliente (sin ceros si prefieres procesarlo)
                            new (sap.m as any).Text({ text: sEntitySet === "/SalesContractSet" ? "{ClienteID}" : "{CustomerCode}" }),
                            // Columna 2: Nombre (ya sea el extraído del pipe o Name1)
                            new (sap.m as any).Text({ text: "{ClienteNombre}" }),
                            // Columna 3: Referencia Bstnk o RFC
                            new (sap.m as any).Text({ text: sEntitySet === "/SalesContractSet" ? "{Bstnk}" : "{RFC}" })
                        ]
                    })
                });
                oTable.setVisible(true);
            } else {
                oTable.setVisible(false);
                MessageToast.show("Sin resultados.");
            }
        },
        error: (oError: any) => {
            oTable.setBusy(false);
            oTable.setVisible(false);
            MessageBox.error("Error al consultar SAP: " + oError.message);
        }
    });
}

public onClienteSelected(oEvent: any): void {
    const oItem = oEvent.getParameter("listItem");
    if (!oItem) return;

    const oCliente = oItem.getBindingContext().getObject();
    // Ajuste de IDs según tu lógica de Split
    const sId = oCliente.ClienteID || oCliente.CustomerCode || oCliente.Vbeln;
    const sNombre = oCliente.ClienteNombre || oCliente.Name1;

    // 1. Cerramos el buscador actual
    if (this._oExpedienteDialog) {
        this._oExpedienteDialog.close();
    }

    // 2. Abrimos el detalle (Fragmento)
    this._openContractDetails(sId, sNombre);
}

private async _openContractDetails(sId: string, sNombre: string): Promise<void> {
    const oView = this.getView();

    if (!this._pContractDetails) {
        // Asignamos la promesa a la variable de clase
        this._pContractDetails = this.loadFragment({
            name: "routeplanningmantto.view.fragments.ContractDetails"
        }) as Promise<Dialog>;
    }

    // "await" resuelve la promesa y nos entrega el objeto Dialog real
    const oDialog = await this._pContractDetails;
    
    oView?.addDependent(oDialog);
    oDialog.setTitle(`Contratos: ${sNombre} (${sId})`);
    oDialog.open();

    // Ahora sí puedes llamar a tus funciones de carga
    this._loadHeaders(sId);
}



private _loadHeaders(sKunnr: string): void {
    // Intentamos obtener la tabla desde el fragmento (usando el ID de la vista)
    const oTable = this.byId("tableContractHeaders") as Table;
    
    if (!oTable) {
        console.error("No se pudo encontrar la tabla tableContractHeaders en el fragmento.");
        // Si falla this.byId, intentamos buscar por Core como plan B
        // const oTableBackup = sap.ui.getCore().byId(this.getView().createId("tableContractHeaders"));
        return;
    }

    oTable.setBusy(true);

    // DATOS DE PRUEBA
    const aFakeContracts = [
        { Vbeln: "4000001", Ktext: "Mantenimiento Preventivo 2026", Bstnk: "REF-001", Status: "A", StatusText: "Activo" },
        { Vbeln: "4000005", Ktext: "Servicio de Emergencia", Bstnk: "REF-999", Status: "B", StatusText: "Pendiente" }
    ];

    // Seteamos el modelo directamente a la tabla para evitar conflictos de contexto
    const oLocalModel = new JSONModel(aFakeContracts);
    oTable.setModel(oLocalModel, "itemsModel"); 

    oTable.bindItems({
        path: "itemsModel>/",
        template: new ColumnListItem({
            cells: [
                new Text({ text: "{itemsModel>Vbeln}" }),
                new Text({ text: "{itemsModel>Ktext}" }),
                new Text({ text: "{itemsModel>Bstnk}" }),
                new ObjectStatus({ 
                    text: "{itemsModel>StatusText}", 
                    state: "{= ${itemsModel>Status} === 'A' ? 'Success' : 'Warning'}" 
                }),
                new Button({
                    icon: "sap-icon://navigation-down-arrow",
                    text: "Ver Ítems",
                    press: (oEv: any) => this.onContractSelect(oEv)
                })
            ]
        })
    });

    oTable.setBusy(false);
}




public onContractSelect(oEvent: any): void {
    // Obtenemos el objeto de la fila seleccionada
    const oCtx = oEvent.getSource().getBindingContext();
    const oContract = oCtx.getObject();
    const sVbeln = oContract.Vbeln;
    
    const oItemTable = this.byId("tableContractItems") as Table;
    if (!oItemTable) return;

    oItemTable.setBusy(true);
    MessageToast.show("Cargando ítems del contrato: " + sVbeln);

    // --- DATOS DE PRUEBA PARA ÍTEMS ---
    const aFakeItems = [
        { Posnr: "10", Material: "Mano de Obra Especializada", Cantidad: "5 hrs" },
        { Posnr: "20", Material: "Lubricante Sintético X", Cantidad: "2 pzas" },
        { Posnr: "30", Material: "Filtro Industrial", Cantidad: "1 pza" }
    ];

    setTimeout(() => {
        oItemTable.setBusy(false);
        oItemTable.setModel(new JSONModel(aFakeItems));
        oItemTable.bindItems({
            path: "/",
            template: new ColumnListItem({
                cells: [
                    new Text({ text: "{Posnr}" }),
                    new Text({ text: "{Material}" }),
                    new Text({ text: "{Cantidad}" }),
                    new Button({
                        icon: "sap-icon://calendar",
                        type: "Accept",
                        press: () => MessageToast.show("Programando ítem...")
                    })
                ]
            })
        });
    }, 600);
}

public onCloseContractDetails(): void {
    const oDialog = this.byId("contractDetailsDialog") as Dialog;
    if (oDialog) {
        oDialog.close();
    }
}



public async onOpenDetalleContratos(sClienteId: string, sNombre: string): Promise<void> {
    if (!this._oDetalleContratosDialog) {
        const Dialog = (await import("sap/m/Dialog")).default;
        const Table = (await import("sap/m/Table")).default;
        const Column = (await import("sap/m/Column")).default;
        const Text = (await import("sap/m/Text")).default;
        const Button = (await import("sap/m/Button")).default;
        const ScrollContainer = (await import("sap/m/ScrollContainer")).default;

        this._oDetalleContratosDialog = new Dialog({
            title: `Contratos: ${sNombre}`,
            contentWidth: "800px",
            contentHeight: "400px",
            content: [
                new ScrollContainer({
                    vertical: true,
                    content: [
                        new Table("tableContratosDetalle", {
                            columns: [
                                new Column({ header: new Text({ text: "Contrato" }) }),
                                new Column({ header: new Text({ text: "Descripción" }) }),
                                new Column({ header: new Text({ text: "Referencia" }) }),
                                new Column({ header: new Text({ text: "Estado" }) })
                            ]
                        })
                    ]
                })
            ],
            endButton: new Button({
                text: "Cerrar",
                press: () => this._oDetalleContratosDialog.close()
            })
        });
        this.getView()?.addDependent(this._oDetalleContratosDialog);
    }

    this._oDetalleContratosDialog.setTitle(`Contratos: ${sNombre} (${sClienteId})`);
    this._oDetalleContratosDialog.open();
    
    // Llamamos a la carga de datos
    this._loadContractData(sClienteId);
}

private _loadContractData(sClienteId: string): void {
    const oTable = sap.ui.getCore().byId("tableContratosDetalle") as any;
    oTable.setBusy(true);

    // --- DATOS DE PRUEBA ---
    const aTestData = [
        { Vbeln: "4000001", Ktext: "Mantenimiento Preventivo", Bstnk: "REF-001", Status: "Activo" },
        { Vbeln: "4000005", Ktext: "Servicio Correctivo", Bstnk: "REF-999", Status: "Pendiente" }
    ];

    // Simulación de delay de red
    setTimeout(() => {
        oTable.setModel(new JSONModel(aTestData));
        oTable.bindItems({
            path: "/",
            template: new (sap.m as any).ColumnListItem({
                cells: [
                    new (sap.m as any).Text({ text: "{Vbeln}" }),
                    new (sap.m as any).Text({ text: "{Ktext}" }),
                    new (sap.m as any).Text({ text: "{Bstnk}" }),
                    new (sap.m as any).ObjectStatus({ 
                        text: "{Status}", 
                        state: "{= ${Status} === 'Activo' ? 'Success' : 'Warning' }" 
                    })
                ]
            })
        });
        oTable.setBusy(false);
    }, 800);

    /* 
    // --- LISTO PARA ODATA (Descomentar cuando ContractHeaderSet funcione) ---
    const oModel = this.getOwnerComponent()?.getModel("ZSD_CATALOGOS_SRV") as ODataModel;
    const oFilter = new Filter("Kunnr", FilterOperator.EQ, sClienteId);

    oModel.read("/ContractHeaderSet", {
        filters: [oFilter],
        success: (oData: any) => {
            oTable.setBusy(false);
            oTable.setModel(new JSONModel(oData.results));
            // Re-bind items aquí...
        },
        error: (oError: any) => {
            oTable.setBusy(false);
            MessageBox.error("Error al cargar contratos");
        }
    });
    */
}


    private _onFakeSearch(): void {
        const oTable = sap.ui.getCore().byId("tableExpediente") as any;
        const aData = [
            { contrato: "MTTO-2026-X8", equipos: "12 Unidades", planeadas: 4, ejecucion: 2 },
            { contrato: "SERV-REGL-01", equipos: "05 Unidades", planeadas: 1, ejecucion: 0 }
        ];
        oTable.setModel(new JSONModel(aData));
        oTable.bindItems({
            path: "/",
            template: new (sap.m as any).ColumnListItem({
                cells: [
                    new (sap.m as any).Text({ text: "{contrato}" }),
                    new (sap.m as any).Text({ text: "{equipos}" }),
                    new (sap.m as any).Text({ text: "{planeadas}" }),
                    new (sap.m as any).Text({ text: "{ejecucion}" })
                ]
            })
        });
        oTable.setVisible(true);
    }

    // --- NUEVOS MÉTODOS DE NAVEGACIÓN ---

    public onShowSupervisores(): void {
        MessageToast.show("Total de Supervisores: 5");
    }

    public onShowMecanicos(): void {
        MessageToast.show("Total de Mecánicos activos: 24");
    }

    public onShowEquipos(): void {
        MessageToast.show("Total de Equipos en sistema: 150");
    }



}

declare global { interface Window { google: any; initMap: any; } }