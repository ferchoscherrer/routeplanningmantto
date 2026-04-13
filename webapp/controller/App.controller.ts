import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
// Importa tu clase personalizada. Ajusta la ruta si es necesario.
import Component from "../Component"; 

/**
 * @namespace routeplanningmantto.controller
 */
export default class App extends Controller {

    public onInit(): void {
        // Realizamos el casting a tu clase 'Component' para que reconozca el método
        const oComponent = this.getOwnerComponent() as Component;

        if (oComponent && typeof oComponent.getContentDensityClass === "function") {
            this.getView()?.addStyleClass(oComponent.getContentDensityClass());
        }
    }
}