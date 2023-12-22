package com.webmedtools.application.backend;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

public class WordArranger {
    private SecureRandom rn = new SecureRandom();

    public List<String> paragraphizer(List<String> input) {
        List<String> output = new ArrayList<String>();
        output.addAll(input);

        // Variables pertain to the output list
        int sentenceLength = rn.nextInt(5) + 17;
        int numOfWords = 0; // Number of words in current sentence
        int index = 0;

        for (String word : input) {
            numOfWords++;
            index++;

            // Adds line breaks to format list into sentences of different lengths
            if (numOfWords == sentenceLength) {
                output.add(index, "\n");
                index++;
                numOfWords = 0;
                sentenceLength = rn.nextInt(5) + 17;
            }
        }
        return output;
    }

    public List<String> sentencer(List<String> list) {
        List<String> formattedList = new ArrayList<String>();
        formattedList.addAll(list);

        // Variables pertain to formattedList
        int sentenceLength = rn.nextInt(6) + 15;
        int index = 0;
        int numOfWords = 0; // Number of words in current sentence
        Boolean newSentence = false;

        for (String word : list) {
            numOfWords++;

            // Capitalizes the first word
            if (index == 0) {
                String capital = formattedList.get(index).substring(0, 1).toUpperCase() + formattedList.get(index).substring(1);
                formattedList.set(index, capital);
            }
            index++;

            // Adds the period at the end of the sentence
            if (numOfWords == sentenceLength) {
                formattedList.add(index, ".");
                index++;

                sentenceLength = rn.nextInt(6) + 15;
                numOfWords = 0;
                newSentence = true;
            }
            // Stops it from overscanning list
            if (index == formattedList.size()) {
                // Adds period at the end of the paragraph if there isn't any
                formattedList.add(".");
                break;
            }

            // Capitalizes the word after a period
            if (newSentence && formattedList.get(index) != "." && formattedList.get(index) != "\n") {
                String capital = formattedList.get(index).substring(0, 1).toUpperCase() + formattedList.get(index).substring(1);
                formattedList.set(index, capital);
                newSentence = false;
            }
        }
        return formattedList;
    }

    public String trimmer(List<String> formattedList) {

        String paragraph = formattedList.toString()
                .replace("[", "")
                .replace("]", "")
                .replace(",", "")
                .replace(" .", ".")
                .replace("\n.", ".\n")
                .replace(" .", ".") // Need this because the previous replace changes spacing of periods sometimes
                .trim();

        return paragraph;
    }
}