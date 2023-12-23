package com.webmedtools.application.backend;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.HasSize;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.server.StreamResource;

@Tag("object")
public class EmbeddedPDFDocument extends Component implements HasSize {
    public EmbeddedPDFDocument(StreamResource resource) {
        getElement().setAttribute("data", resource);
        setSizeFull();
    }
}
