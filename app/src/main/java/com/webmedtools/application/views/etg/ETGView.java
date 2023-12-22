package com.webmedtools.application.views.etg;

import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.button.ButtonVariant;
import com.vaadin.flow.component.notification.Notification;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextArea;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;
import com.vaadin.flow.router.RouteAlias;
import com.webmedtools.application.views.MainLayout;

@PageTitle("ETG")
@Route(value = "ETG", layout = MainLayout.class)
@RouteAlias(value = "", layout = MainLayout.class)
public class ETGView extends VerticalLayout {

    Button generate = new Button("Generate");
    Button download = new Button("Download (PDF)");
    Button print = new Button("Print");
    TextArea textArea = new TextArea();

    public ETGView() {
        textArea.setWidthFull();
        textArea.setLabel("Preview");
        textArea.setReadOnly(false);
        textArea.setAutocapitalize(null);
        textArea.setAutocomplete(null);
        textArea.setAutocorrect(false);
        textArea.setPlaceholder("Click the generate button to see a preview in this text box, \nthen you can either download it as a file or print it.");

        add(textArea, buttonLayout());
    }

    private HorizontalLayout buttonLayout() {
        generate.addThemeVariants(ButtonVariant.LUMO_PRIMARY);
        generate.addClickListener(click -> {
            //eService.fillTextArea(textArea);
            //VaadinSession.getCurrent().setAttribute(TextArea.class, textArea);
        });

        // Create a download button
        download.addThemeVariants(ButtonVariant.MATERIAL_CONTAINED);



        // ***ADD PRINT FUNCTIONALITY***
        print.addThemeVariants(ButtonVariant.MATERIAL_CONTAINED);
        print.addClickListener(click -> {
            // Opens the PrintView page in a new tab

        });

        return new HorizontalLayout(generate, download, print);
    }
}
