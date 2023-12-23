package com.webmedtools.application.data.service;

import com.vaadin.flow.component.Component;
import com.vaadin.flow.component.textfield.TextArea;
import com.vaadin.flow.server.StreamResource;
import com.webmedtools.application.backend.EmbeddedPDFDocument;
import com.webmedtools.application.backend.Generator;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class ETGService {
    Generator g = new Generator();

    // Takes output of the generator and puts it in the text field on the website
    public void fillTextArea(TextArea textArea) {
        String paragraph = g.generate();
        textArea.setValue(paragraph);
    }

    public Component embedPDF(TextArea textArea) {
        Component embeddedPDF = new EmbeddedPDFDocument(new StreamResource("Eye Test Generation.pdf", () ->
        {
            try {
                return convertToPDF(textArea);
            } catch (IOException e) {
                e.printStackTrace();
                return new ByteArrayInputStream("An error has occured: Unable to print Eye Test Generation as a pdf file".getBytes());
            }
        }));

        return embeddedPDF;
    }

    // Converts the current text inside TextArea into a PDF file, which is saved to a stream of bytes
    public ByteArrayInputStream convertToPDF(TextArea textArea) throws IOException {
        String text = textArea.getValue();
        String formattedText = text.replace("\n", "");

        // Creates a new PDF document and adds a page to it
        PDDocument pdf = new PDDocument();
        PDPage page = new PDPage();
        pdf.addPage(page);

        // Font
        PDFont font = PDType1Font.HELVETICA;
        float fontSize = 12;
        float leading = 1.5f * fontSize;

        // Defines the area where text will be put into PDF
        PDRectangle mediaBox = page.getMediaBox();
        float margin = 72;
        float width = mediaBox.getWidth() - 2*margin;
        float startX = mediaBox.getLowerLeftX() + margin;
        float startY = mediaBox.getUpperRightY() - margin;

        List<String> lines = new ArrayList<String>();
        int lastSpace = -1;

        // Goes through the string made by Generator and separates it into a list of lines based on how each
        // word fits within the margin of the pdf
        while (formattedText.length() > 0) {
            int spaceIndex = formattedText.indexOf(" ", lastSpace + 1);
            if (spaceIndex < 0) {
                spaceIndex = formattedText.length();
            }

            String subString = formattedText.substring(0, spaceIndex);
            float size = fontSize * font.getStringWidth(subString) / 1000;

            if (size > width) {
                if (lastSpace < 0) {
                    lastSpace = spaceIndex;
                }

                subString = formattedText.substring(0, lastSpace);
                lines.add(subString);
                formattedText = formattedText.substring(lastSpace).trim();
                lastSpace = -1;

            } else if (spaceIndex == formattedText.length()) {
                lines.add(formattedText);
                formattedText = "";

            } else {
                lastSpace = spaceIndex;
            }
        }

        // "Holds" the document in a content stream
        PDPageContentStream stream = new PDPageContentStream(pdf, page);

        // Writes lines of text into PDF, then closes writing stream
        stream.beginText();
        stream.setFont(font, fontSize);
        stream.newLineAtOffset(startX, startY);
        for (String line : lines) {
            stream.showText(line);
            stream.newLineAtOffset(0, -leading);
        }
        stream.endText();
        stream.close();

        // Save results as a stream of bytes and closes document
        ByteArrayOutputStream pdfStream = new ByteArrayOutputStream();
        pdf.save(pdfStream);
        pdf.close();
        ByteArrayInputStream output = new ByteArrayInputStream(pdfStream.toByteArray());

        return output;
    }
}
