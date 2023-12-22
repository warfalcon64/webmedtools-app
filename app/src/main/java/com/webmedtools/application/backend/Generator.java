package com.webmedtools.application.backend;

import java.io.FileNotFoundException;
import java.io.PrintWriter;
import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class Generator {
    public String generate() {
        String[] alphabet = {"a","b","c","d","e","f","g","h","i","j","k","l", "m","n","o","p","q","r","s","t","u","v",
                "w","x","y","z"};
        List<String> output = new ArrayList<String>();
        WordMaker wm = new WordMaker();
        Random rn = new Random();
        WordArranger wa = new WordArranger();

        int index = 0;
        int nextChar = 0; // Keeps track of the index of the next letter in alphabet[]

        for (String letter : alphabet) {
            int length = rn.nextInt(3) + 3;

            String word = wm.createWord(letter, length);
            output.add(index, word);
            index++;
            nextChar++;

            int max = rn.nextInt(6) + 6; // Max amount of filler words in between actual words
            int step = 0; // Current amount of filler words

            while (step <= max) {
                if (nextChar == 26) break; // Prevents overflow in the array
                length = rn.nextInt(3) + 3;

                String filler = wm.createFiller(alphabet[nextChar], length);
                output.add(index, filler);
                index++;
                step ++;
            }
        }
        // ------ Output Beautification ------
        List<String> list = wa.paragraphizer(output);
        List<String> formattedList = wa.sentencer(list);

        return wa.trimmer(formattedList);
    }

    // Legacy and potentially debug code
    public void writeFile(String paragraph) throws FileNotFoundException, UnsupportedEncodingException {
        PrintWriter writer = new PrintWriter("C:/Users/kkmen/Documents/GitHub/ETG-Vaadin/src/main/resources/Eye-Test.txt", "UTF-8");
        writer.print(paragraph);
        writer.close();
    }
}