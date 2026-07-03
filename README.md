# Defined

This is a chrome extension that will allow allow the user to highlight any word in standard English on their Chrome browser and see the definition instantly on a soft pink popup. This tool also works for words not in the dictionary, a wikipedia summary is returned.

# Architecture

When you select a word or search manually in the toolbar:

1.  **Tier 1: Curated Developer Glossary (`cs_terms.json`)**
    *   First checks the local database for rapid lookup of developer terms (like `tmux`, `git`, `docker`, and `Kubernetes`).
2.  **Tier 2: Standard Dictionary API (`dictionaryapi.dev`)**
    *   If not in the developer database, it queries a standard English dictionary API to fetch correct phonetics, standard MP3 vocal pronunciation audio, and definitions.
3.  **Tier 3: Wikipedia REST API Summary Fallback (`en.wikipedia.org`)**
    *   If the term is not a standard English word, it falls back to the Wikipedia Page Summary.


# Installation

To load the extension into Google Chrome:

1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  In the upper right corner, toggle **Developer mode** to ##@**ON**.
3.  Click the **Load unpacked** button in the upper left corner.
4.  Navigate to and select the **`defined`** folder inside your file explorer.
5.  *Optional:* Click the Puzzle piece icon in your toolbar and **Pin** the **Defined** extension!
