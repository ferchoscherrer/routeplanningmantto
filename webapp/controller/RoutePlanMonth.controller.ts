import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import History from "sap/ui/core/routing/History";
import UIComponent from "sap/ui/core/UIComponent";
import GroupHeaderListItem from "sap/m/GroupHeaderListItem";
import MessageBox from "sap/m/MessageBox";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import List from "sap/m/List";
import CustomListItem from "sap/m/CustomListItem";
import BusyDialog from "sap/m/BusyDialog";
import Button from "sap/m/Button";
import Item from "sap/ui/core/Item";
import ComboBox from "sap/m/ComboBox";
import SelectDialog from "sap/m/SelectDialog";
import StandardListItem from "sap/m/StandardListItem";

/**
 * @namespace routeplanningmantto.controller
 */
export default class RoutePlanMonth extends Controller {

    private _oBusyDialog: BusyDialog;
    private _sSelectedSupervisorMail: string = "";

    public onInit(): void {
        const oRouter = UIComponent.getRouterFor(this);
        oRouter.getRoute("RoutePlanMonth")?.attachPatternMatched(this._onRouteMatched, this);
        this._setupFechaComboBox();
    }

    private _onRouteMatched(): void {
        this._openSupervisorSelectDialog();
    }

    private _setupFechaComboBox(): void {
        const oComboBox = this.byId("comboFechaFiltro") as any;
        if (!oComboBox) return;

        const aMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        
        // Obtenemos fecha actual (Mayo 2026 en este contexto)
        const oFechaActual = new Date();
        const iAnioActual = oFechaActual.getFullYear();
        const iMesActual = oFechaActual.getMonth(); 

        oComboBox.destroyItems();

        for (let i = 0; i < aMeses.length; i++) {
            const sMesNum = (i + 1).toString().padStart(2, '0');
            const sKey = `${iAnioActual}${sMesNum}`;

            // USAMOS LA CLASE ITEM IMPORTADA DIRECTAMENTE
            oComboBox.addItem(new Item({
                key: sKey,
                text: `${aMeses[i]} ${iAnioActual}`
            }));
        }

        // Seleccionar el mes actual por defecto
        const sDefaultKey = `${iAnioActual}${(iMesActual + 1).toString().padStart(2, '0')}`;
        oComboBox.setSelectedKey(sDefaultKey);
    }

    public onFechaChange(oEvent: any): void {
        const sSelectedKey = oEvent.getSource().getSelectedKey();
        
        if (sSelectedKey) {
            // Llamamos a la carga con el nuevo periodo (YYYYMM)
            this._loadOData(sSelectedKey);
        }
    }


    private _openSupervisorSelectDialog(): void {
    const oComponent = this.getOwnerComponent();
    const oDataModel = oComponent?.getModel("ZCS_GET_EMPLOYE_SRV") as any;

    if (!oDataModel) return;

    BusyIndicator.show(0);

    // Filtro para traer solo SUPERVISOR
    const oFilter = new Filter("Puesto", FilterOperator.EQ, "SUPERVISOR");

    oDataModel.read("/EmployesSet", {
        filters: [oFilter],
        success: (oData: any) => {
            BusyIndicator.hide();
            const aSupervisores = oData.results || [];
            this._showSelectionDialog(aSupervisores);
        },
        error: (oError: any) => {
            BusyIndicator.hide();
            MessageBox.error("Error al cargar la lista de supervisores.");
        }
    });
}

private _showSelectionDialog(aSupervisores: any[]): void {
    const oSelectDialog = new SelectDialog({
        title: "Seleccione Supervisor",
        // Habilitamos la búsqueda en más campos si lo deseas
        items: aSupervisores.map(sup => {
            // Concatenamos el nombre completo
            const sNombreCompleto = `${sup.Nombre} ${sup.ApellidoP || ""} ${sup.ApellidoM || ""}`.trim();
            
            return new StandardListItem({
                title: sNombreCompleto,
                description: sup.Mail,
                info: sup.Base, // Mostramos la Base en la parte derecha
                infoState: "None", // Puedes usar "Success" para resaltar el texto de la base
                type: "Active"
            });
        }),
        search: (oEvent: any) => {
            const sValue = oEvent.getParameter("value");
            const oBinding = oEvent.getSource().getBinding("items");
            
            // Filtro múltiple para buscar por nombre o por base
            const oFilterNombre = new Filter("title", FilterOperator.Contains, sValue);
            const oFilterBase = new Filter("info", FilterOperator.Contains, sValue);
            const oCombinedFilter = new Filter({
                filters: [oFilterNombre, oFilterBase],
                and: false // Para que busque en uno o en otro
            });
            
            oBinding.filter(sValue ? [oCombinedFilter] : []);
        },
        confirm: (oEvent: any) => {
            const oSelectedItem = oEvent.getParameter("selectedItem") as StandardListItem;
            if (oSelectedItem) {
                // Seguimos tomando el mail de la descripción
                this._sSelectedSupervisorMail = oSelectedItem.getDescription();
                this._loadOData();
            }
            oEvent.getSource().destroy();
        },
        cancel: (oEvent: any) => {
            oEvent.getSource().destroy();
            this.onNavBack();
        }
    });

    this.getView()?.addDependent(oSelectDialog);
    oSelectDialog.open("");
}




    private _loadOData(sPeriodo?: string): void {
        const oComponent = this.getOwnerComponent();
        const oDataModel = oComponent?.getModel("db") as any;
        const oComboBox = this.byId("comboFechaFiltro") as any;

        if (!oDataModel) return;

        // Si no recibimos periodo, lo tomamos del ComboBox (que ya tiene el default del mes actual)
        const sFechaKey = sPeriodo || oComboBox.getSelectedKey(); 

        // Construimos la llave dinámica: Correo | YYYYMM
        //const sUserMail = "ldelacruz@melco.com.mx"; 
        const sUserMail = this._sSelectedSupervisorMail;
        const sDynamicKey = `${sUserMail}|${sFechaKey}`; 

        console.log("Cargando datos para la llave:", sDynamicKey);

        const oFilter = new Filter("Mail", FilterOperator.EQ, sDynamicKey);

        // Mostramos un indicador de carga global
        BusyIndicator.show(0);

        oDataModel.read("/HeaderRouteSet", {
            filters: [oFilter],
            urlParameters: { 
                "$expand": "ServicesRouteSet,MechanicRouteSet" 
            },
            success: (oData: any) => {
                BusyIndicator.hide();
                const aResults = oData.results ? oData.results : [];
                
                if (aResults.length > 0) {
                    const oPrincipalData = aResults[0];
                    const oDbModel = new JSONModel(oPrincipalData);
                    this.getView()?.setModel(oDbModel, "db");
                    
                    this._processPlanningData(oDbModel);
                } else {
                    // Si no hay datos, limpiamos el modelo actual para que no se vea info vieja
                    this.getView()?.setModel(new JSONModel({}), "db");
                    MessageToast.show("No se encontraron datos para el periodo seleccionado.");
                }
            },
            error: (oError: any) => {
                BusyIndicator.hide();
                console.error("Error técnico:", oError);
                MessageBox.error("Error al cargar los datos del periodo.");
            }
        });
    }

    private _processPlanningData(oModel: JSONModel): void {
        const oData = oModel.getData();
        const aServicios = oData.ServicesRouteSet?.results || [];
        const aMecanicos = oData.MechanicRouteSet?.results || [];

        let iCountBloqueados = 0;
        let iCountTermino = 0;

        aServicios.forEach((s: any) => {
            s.Cliente = s.Nombre || s.Cliente;

            // --- PROCESAMIENTO DE STATUS (NUEVO) ---
            if (s.Status && s.Status.includes("|")) {
                const aParts = s.Status.split("|").map((p: string) => p.trim());
                
                s.StatusText = aParts[0] || ""; 
                s.StatusSub1 = aParts[1] || ""; 
                s.StatusSub2 = aParts[2] || ""; 
                s.StatusSub3 = aParts[3] || "";
                
                let sRawSub4 = aParts[4] || "";
                if (sRawSub4 === "-" || sRawSub4 === "") {
                    s.StatusSub4 = "";
                } else {
                    s.StatusSub4 = sRawSub4;
                    iCountBloqueados++; // Contador de bloqueados
                }
            } else {
                s.StatusText = s.Status || "";
                s.StatusSub1 = s.StatusSub2 = s.StatusSub3 = s.StatusSub4 = "";
            }

            // --- LÓGICA DE BLOQUEO POR REGLAS DE NEGOCIO ---
            const bExpirado = this.isExpired(s.VigenciaFin) === true;
            if (bExpirado) iCountTermino++; // Contador de término (expirados)

            const bBloqueadoStatus = s.StatusSub4 !== "";
            const bTieneOrden = !!s.Orden || !!s.UltimaOrden;

            if (bExpirado || bBloqueadoStatus || bTieneOrden) {
                s.Selected = false;
            }

            // --- LÓGICA DE ULTIMA ORDEN ---
            if (s.UltimaOrden && s.UltimaOrden.includes("|")) {
                const aOrdenes = s.UltimaOrden.split("|");
                s.UltimaOrden = aOrdenes[aOrdenes.length - 1].trim();
            }
            
            if (s.FechaProgramada) {
                const [day, month, year] = s.FechaProgramada.split('/');
                s.GroupKey = `${year}${month}${day} | RUTA-${s.AsignadoA || 'POR_PROGRAMAR'}`;
                
                const oFechaObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                const sNombreDia = oFechaObj.toLocaleDateString('es-MX', { weekday: 'long' });
                s.FechaFull = sNombreDia.charAt(0).toUpperCase() + sNombreDia.slice(1) + ", " + s.FechaProgramada;
                s.RankingTexto = s.CargaNum ? `${s.CargaNum}ª Visita` : "Programado";
            }
        });

        const aStats = aMecanicos.map((m: any) => {
            const sIdLimpio = (m.Id || "").replace(/^0+/, '');
            const aMisServicios = aServicios.filter((s: any) => {
                const sNominaS = (s.Mecanicos || "").split("|")[0].trim().replace(/^0+/, '');
                return sNominaS === sIdLimpio;
            });

            const aServiciosConOrden = aMisServicios.filter((s: any) => !!s.Orden);
            const iCarga = aMisServicios.length > 0 ? Math.round((aServiciosConOrden.length / aMisServicios.length) * 100) : 0;

            return {
                Id: sIdLimpio,
                Nombre: m.Nombre,
                KmTotales: (Math.random() * 40).toFixed(1),
                PorcentajeCarga: iCarga
            };
        });

        oModel.setProperty("/MecanicosStats", aStats);
        oModel.setProperty("/TotalEquipos", aServicios.length);
        oModel.setProperty("/TotalMecanicos", aMecanicos.length);
        oModel.setProperty("/TotalBloqueados", iCountBloqueados);
        oModel.setProperty("/TotalTermino", iCountTermino);
        
        oModel.refresh(true);
    }

    public formatProgressState(iPercentage: any): string {
        const nValue = parseFloat(iPercentage);
        if (nValue >= 90) return "Error";
        if (nValue >= 70) return "Warning";
        return "Success";
    }

    public getGroupHeader(oGroup: any): GroupHeaderListItem {
        const aParts = oGroup.key.split(" | ");
        const sFechaRaw = aParts[0];
        const sFormattedDate = `${sFechaRaw.substring(6, 8)}/${sFechaRaw.substring(4, 6)}/${sFechaRaw.substring(0, 4)}`;
        return new GroupHeaderListItem({ title: `Fecha: ${sFormattedDate} - ${aParts[1]}`, upperCase: false });
    }

    public onNavBack(): void {
        const oHistory = History.getInstance();
        if (oHistory.getPreviousHash() !== undefined) {
            window.history.go(-1);
        } else {
            UIComponent.getRouterFor(this).navTo("RouteMain", {}, true);
        }
    }

    public async onGenerarOrdenes(): Promise<void> {
        const oModel = this.getView()?.getModel("db") as JSONModel;
        const aTodosLosServicios = oModel.getProperty("/ServicesRouteSet/results") || [];
        
        const aServiciosSeleccionados = aTodosLosServicios.filter((s: any) => 
            s.Selected === true && 
            this.isExpired(s.VigenciaFin) !== true &&
            (!s.StatusSub4 || s.StatusSub4 === "")
        );

        if (aServiciosSeleccionados.length === 0) return;

        const bHayOrdenesPrevias = aServiciosSeleccionados.some((s: any) => !!s.UltimaOrden || !!s.Orden);

        if (bHayOrdenesPrevias) {
            MessageBox.confirm("Algunos equipos ya cuentan con una orden programada en este periodo. ¿Desea generar una nueva orden de todos modos?", {
                title: "Confirmar Duplicidad",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: (oAction: any) => {
                    if (oAction === MessageBox.Action.YES) {
                        this._executeBatchCreation(aServiciosSeleccionados);
                    } else {
                        aTodosLosServicios.forEach((s: any) => s.Selected = false);
                        const oBtn = this.byId("btnGenerarOrdenes") as any;
                        if (oBtn) oBtn.setEnabled(false);
                        oModel.refresh(true);
                    }
                }
            });
        } else {
            this._executeBatchCreation(aServiciosSeleccionados);
        }
    }

    private async _executeBatchCreation(aServiciosSeleccionados: any[]): Promise<void> {
        const oModel = this.getView()?.getModel("db") as JSONModel;
        const aTodosLosServicios = oModel.getProperty("/ServicesRouteSet/results") || [];
        const aMecanicosStats = oModel.getProperty("/MecanicosStats") || []; 
        const oList = this.byId("routeList") as any;

        if (!this._oBusyDialog) {
            this._oBusyDialog = new BusyDialog({
                title: "Programando Órdenes",
                text: "Iniciando comunicación con SAP..."
            });
        }
        this._oBusyDialog.open();

        const oDataModel = this.getOwnerComponent()?.getModel("db") as any;
        const sFechaFija = "20260515";
        let iContadorExito = 0; 

        try {
            for (let i = 0; i < aServiciosSeleccionados.length; i++) {
                const oItem = aServiciosSeleccionados[i];
                this._oBusyDialog.setText(`Procesando selección ${i + 1} de ${aServiciosSeleccionados.length}...\nEquipo: ${oItem.Equipo}`);

                let sContratoLimpio = (oItem.Contrato || "").split("-")[0];

                const oPayload = {
                    "Equipo": oItem.Equipo,
                    "FechaInicio": sFechaFija,
                    "FechaFin": sFechaFija,
                    "Mecanico": oItem.AsignadoA || "",
                    "Supervisor": "SUP_ALBERTO",
                    "Paquetes": oItem.Paquetes || "01",
                    "Ruta": oItem.Ruta || "",
                    "Contrato": sContratoLimpio.trim(),
                    "PosContrato": oItem.Posicion || "",
                    "Cobertura": "TOTAL",
                    "NumVisita": oItem.CargaNum ? oItem.CargaNum.toString() : "1",
                    "Cliente": oItem.Nombre || oItem.Cliente || "",
                    "Status": "", "Mensaje": "", "Orden": "", "PuestoTrabajo": "TEC_ELEV"
                };

                const oVisualItem = oList.getItems().find((item: any) => {
                    const oCtx = item.getBindingContext("db");
                    return oCtx && oCtx.getProperty("Equipo") === oItem.Equipo;
                });

                if (oVisualItem) {
                    oVisualItem.getDomRef()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                try {
                    const oResponse: any = await this._createEntityPromise(oDataModel, "/PlanningItemsSet", oPayload);
                    oItem.Orden = oResponse.Orden;
                    oItem.Mensaje = oResponse.Mensaje;

                    if (oResponse.Orden) {
                        iContadorExito++;
                        const sNominaServicio = (oItem.Mecanico || "").split("|")[0].trim().replace(/^0+/, '');
                        const oMecanico = aMecanicosStats.find((m: any) => m.Id.toString().replace(/^0+/, '') === sNominaServicio);

                        if (oMecanico) {
                            const aTodosDelMec = aTodosLosServicios.filter((s: any) => (s.Mecanico || "").split("|")[0].trim().replace(/^0+/, '') === oMecanico.Id.replace(/^0+/, ''));
                            const aServiciosConOrden = aTodosDelMec.filter((s: any) => !!s.Orden);
                            if (aTodosDelMec.length > 0) {
                                oMecanico.PorcentajeCarga = Math.round((aServiciosConOrden.length / aTodosDelMec.length) * 100);
                            }
                        }
                    }
                    this._oBusyDialog.setText(`Respuesta SAP para ${oItem.Equipo}:\nOrden: ${oResponse.Orden}\n${oResponse.Mensaje}`);
                    oModel.refresh(true);
                } catch (oError: any) {
                    oItem.Mensaje = "Error de comunicación";
                    oModel.refresh(true);
                }
            }
            this._oBusyDialog.close();
            aTodosLosServicios.forEach((s: any) => s.Selected = false);
            const oBtn = this.byId("btnGenerarOrdenes") as any;
            if(oBtn) oBtn.setEnabled(false);
            oModel.refresh(true);
            MessageBox.success(`Proceso finalizado.\nSeleccionados: ${aServiciosSeleccionados.length}\nÓrdenes generadas: ${iContadorExito}`);
        } catch (err) {
            if (this._oBusyDialog) this._oBusyDialog.close();
            MessageBox.error("Error crítico en el proceso masivo.");
        }
    }

    private _createEntityPromise(oDataModel: any, sEntitySet: string, oPayload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            oDataModel.create(sEntitySet, oPayload, {
                success: (oData: any) => resolve(oData),
                error: (oError: any) => reject(oError)
            });
        });
    }

    public onSelectionChange(): void {
        const oModel = this.getView()?.getModel("db") as JSONModel;
        const aServicios = oModel.getProperty("/ServicesRouteSet/results") || [];
        const oBtn = this.byId("btnGenerarOrdenes") as Button;

        const bAnySelected = aServicios.some((s: any) => s.Selected === true);
        oBtn.setEnabled(bAnySelected);
    }

    public onSelectAll(): void {
        const oModel = this.getView()?.getModel("db") as JSONModel;
        const aServicios = oModel.getProperty("/ServicesRouteSet/results") || [];
        const oBtnSelect = this.byId("btnSelectAll") as any;
        
        const aElegibles = aServicios.filter((s: any) => {
            const bExpirado = this.isExpired(s.VigenciaFin);
            const bBloqueadoStatus = s.StatusSub4 && s.StatusSub4 !== "";
            return !s.Orden && bExpirado !== true && !bBloqueadoStatus; 
        });

        const bTodosElegiblesMarcados = aElegibles.length > 0 && aElegibles.every((s: any) => s.Selected === true);
        const bNuevoValor = !bTodosElegiblesMarcados;

        aServicios.forEach((s: any) => {
            const bExpirado = this.isExpired(s.VigenciaFin);
            const bBloqueadoStatus = s.StatusSub4 && s.StatusSub4 !== "";
            
            if (!s.Orden && bExpirado !== true && !bBloqueadoStatus) {
                s.Selected = bNuevoValor;
            } else {
                s.Selected = false;
            }
        });

        oBtnSelect.setIcon(bNuevoValor ? "sap-icon://multiselect-none" : "sap-icon://multiselect-all");
        
        oModel.refresh(true);
        this.onSelectionChange();

        if (bNuevoValor && aElegibles.length === 0) {
            MessageToast.show("No hay equipos vigentes disponibles para seleccionar.");
        }
    }

    public formatPaquetes(sPaquetes: string): string {
        if (!sPaquetes) return "Ciclos Programados: No definidos";

        const oMeses: any = {
            "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
            "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
            "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic"
        };

        const aPartes = sPaquetes.split("|");
        const aTraducidos = aPartes.map(sId => oMeses[sId.trim()] || sId);
        const sMesesTexto = aTraducidos.join(", ");

        return "Ciclos Programados: (" + sMesesTexto + ")";
    }

    public formatVigencia(sVigencia: string): string {
        if (!sVigencia || sVigencia.length < 6) {
            return sVigencia;
        }

        const sYear = sVigencia.substring(0, 4);
        const sMonth = sVigencia.substring(4, 6);
        
        const aMeses: any = {
            "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
            "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
            "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic"
        };

        const sMesNombre = aMeses[sMonth] || sMonth;
        return `${sMesNombre} ${sYear}`;
    }

    public isExpired(sVigenciaFin: string): any {
        const oCombo = this.byId("comboFechaFiltro") as any;
        const sSelectedKey = oCombo.getSelectedKey(); 
        
        if (!sVigenciaFin || sVigenciaFin === "00000000" || sVigenciaFin.startsWith("00")) {
            return "NULL"; 
        }

        if (!sSelectedKey) {
            return false;
        }

        const sVigYearMonth = sVigenciaFin.substring(0, 6);
        const iVigenciaNum = parseInt(sVigYearMonth);

        let iSelectedNum: number;
        
        if (sSelectedKey.length === 6) {
            iSelectedNum = parseInt(sSelectedKey);
        } else {
            const sMonth = sSelectedKey.substring(0, 2);
            const sYear = sSelectedKey.substring(2, 6);
            iSelectedNum = parseInt(sYear + sMonth);
        }

        return iVigenciaNum < iSelectedNum;
    }

    public formatNiveles(sNiveles: string): string {
        if (!sNiveles) {
            return "Nd";
        }

        const iIndex = sNiveles.indexOf("=");

        if (iIndex !== -1) {
            const sResult = sNiveles.substring(iIndex + 1).trim();
            return sResult !== "" ? sResult : "Nd";
        }

        return "Nd";
    }
}