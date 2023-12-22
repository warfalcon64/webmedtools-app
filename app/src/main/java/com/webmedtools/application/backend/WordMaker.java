package com.webmedtools.application.backend;
import java.security.SecureRandom;

public class WordMaker {
    private SecureRandom rn = new SecureRandom();
    private String[] alphabet = {"a","b","c","d","e","f","g","h","i","j","k","l", "m","n","o","p","q","r","s","t","u",
            "v","w","x","y","z"};

    // Makes a randomized sequence of characters of the specified length that contains the given character
    public String createWord(String character, int length) {
        String word = "";
        Boolean redo = true;

        while (redo) {
            for (int i = 0; i < length; i++) {
                int ranIndex = rn.nextInt(alphabet.length);
                String letter = alphabet[ranIndex];

                word += letter;
            }

            if (word.contains(character) && word.indexOf(character) == word.lastIndexOf(character)) {
                redo = false;
            } else {
                word = "";
            }
        }

        return word;
    }

    // Makes a randomized sequence of characters of the specified length that does not contain the given character
    public String createFiller(String character, int length) {
        String word = "";
        Boolean redo = true;

        while (redo) {
            for (int i = 0; i < length; i++) {
                int ranIndex = rn.nextInt(alphabet.length);
                String letter = alphabet[ranIndex];

                word += letter;
            }

            if (!word.contains(character)) {
                redo = false;
            } else {
                word = "";
            }
        }

        return word;
    }
}