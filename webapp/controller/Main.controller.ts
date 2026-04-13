import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import GeoMap from "sap/ui/vbm/GeoMap";
import ToolPage from "sap/tnt/ToolPage";

/**
 * @namespace routeplanningmantto.controller
 */
export default class Main extends Controller {

    public onInit(): void {
        const oData = {
            mecanicos: [
                { id: "M01", nombre: "Juan Pérez" },
                { id: "M02", nombre: "Ana Gómez" }
            ],
            puntosMantenimiento: []
        };
        this.getView()?.setModel(new JSONModel(oData), "localModel");
    }

    public onSideNavButtonPress(): void {
        const oToolPage = this.byId("toolPage") as ToolPage;
        oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
    }

    public onCenterHome(): void {
        const oMap = this.byId("mainGeoMap") as GeoMap;
        oMap.setCenterPosition("-99.1332;19.4326;0");
        oMap.setZoomlevel(12);
    }

    public onZonaChange(oEvent: any): void {
        const sKey = oEvent.getSource().getSelectedKey();
        const oMap = this.byId("mainGeoMap") as GeoMap;
        if (sKey === "YUC") {
            oMap.setCenterPosition("-89.6237;20.9676;0");
        } else {
            oMap.setCenterPosition("-99.1332;19.4326;0");
        }
    }

    public onOptimizarRutas(): void {
        MessageToast.show("Optimizando rutas...");
    }
}