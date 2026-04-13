import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";
import Device from "sap/ui/Device";

/**
 * @namespace routeplanningmantto
 */
export default class Component extends BaseComponent {

    public static metadata = {
        manifest: "json",
        interfaces: [
            "sap.ui.core.IAsyncContentCreation"
        ]
    };

    public init() : void {
        // call the base component's init function
        super.init();

        // set the device model
        this.setModel(createDeviceModel(), "device");

        // enable routing
        this.getRouter().initialize();
    }

    /**
     * Este método determina la densidad visual de la aplicación.
     * Resuelve el error en App.controller.ts
     */
    public getContentDensityClass() : string {
        if (!this._sContentDensityClass) {
            if (!Device.support.touch) {
                this._sContentDensityClass = "sapUiSizeCompact";
            } else {
                this._sContentDensityClass = "sapUiSizeCozy";
            }
        }
        return this._sContentDensityClass;
    }

    private _sContentDensityClass: string;
}