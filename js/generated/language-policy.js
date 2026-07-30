/**
 * GENERATED FILE. DO NOT EDIT.
 *
 * Built from the canonical seeds by scripts/fonoran-build-language-policy.js:
 *   data/fonoran-grammar-policy.json    policy, keyed by concept id
 *   data/fonoran-grammar-particles.json particle inventory
 *   data/fonoran-sound-bucket.json      root spellings
 *   data/fonoran-compounds.json         compound compositions
 *   data/fonoran-root-rings.json        learning rings and caps
 *
 * Spellings here are DERIVED. To change one, change the seed and rebuild:
 *   npm run fonoran:build:policy
 *
 * Editing this file by hand will be reverted by the next build and will fail
 * `npm test`, which re-derives it and compares.
 */

export const LANGUAGE_POLICY = Object.freeze({
  "policy_version": 1,
  "concept_forms": {
    "unknown": "nohu",
    "person": "ba",
    "thing": "to",
    "place": "che",
    "time": "kan",
    "cause": "gak",
    "manner": "moyu",
    "count": "tan",
    "know": "hu",
    "need": "les",
    "maybe": "ketnat",
    "logic_not": "no",
    "pronoun_i": "mi",
    "addressee": "be",
    "collective": "dan",
    "tense_past": "ta",
    "tense_future": "sa",
    "logic_yes": "ya",
    "logic_if": "von",
    "one": "lu"
  },
  "function_words": {
    "pronoun_i": {
      "form": "mi",
      "english": [
        "i",
        "me",
        "my",
        "myself",
        "mine"
      ],
      "label": "I / me"
    },
    "addressee": {
      "form": "be",
      "english": [
        "you",
        "your",
        "yourself",
        "yours",
        "thou",
        "thee",
        "thy"
      ],
      "label": "you"
    },
    "collective": {
      "form": "dan",
      "english": [
        "we",
        "us",
        "our",
        "ourselves",
        "ours",
        "together"
      ],
      "label": "we"
    },
    "tense_past": {
      "form": "ta",
      "english": [
        "was",
        "were",
        "had",
        "did",
        "ago",
        "yesterday",
        "before"
      ],
      "label": "past"
    },
    "tense_future": {
      "form": "sa",
      "english": [
        "will",
        "shall",
        "would",
        "going",
        "tomorrow",
        "soon",
        "later"
      ],
      "label": "future"
    },
    "logic_not": {
      "form": "no",
      "english": [
        "not",
        "never",
        "no",
        "none",
        "nothing",
        "cannot"
      ],
      "label": "not"
    },
    "logic_yes": {
      "form": "ya",
      "english": [
        "yes"
      ],
      "label": "yes"
    },
    "logic_if": {
      "form": "von",
      "english": [
        "if"
      ],
      "label": "if"
    },
    "one": {
      "form": "lu",
      "english": [
        "one",
        "single",
        "someone",
        "something"
      ],
      "label": "one"
    }
  },
  "wh_composition": {
    "who": {
      "concepts": [
        "unknown",
        "person"
      ],
      "forms": [
        "nohu",
        "ba"
      ]
    },
    "whom": {
      "concepts": [
        "unknown",
        "person"
      ],
      "forms": [
        "nohu",
        "ba"
      ]
    },
    "what": {
      "concepts": [
        "unknown",
        "thing"
      ],
      "forms": [
        "nohu",
        "to"
      ]
    },
    "where": {
      "concepts": [
        "unknown",
        "place"
      ],
      "forms": [
        "nohu",
        "che"
      ]
    },
    "when": {
      "concepts": [
        "unknown",
        "time"
      ],
      "forms": [
        "nohu",
        "kan"
      ]
    },
    "why": {
      "concepts": [
        "unknown",
        "cause"
      ],
      "forms": [
        "nohu",
        "gak"
      ]
    },
    "how": {
      "concepts": [
        "unknown",
        "manner"
      ],
      "forms": [
        "nohu",
        "moyu"
      ]
    },
    "how many": {
      "concepts": [
        "unknown",
        "count"
      ],
      "forms": [
        "nohu",
        "tan"
      ]
    },
    "how much": {
      "concepts": [
        "unknown",
        "count"
      ],
      "forms": [
        "nohu",
        "tan"
      ]
    }
  },
  "wh_blocked": {},
  "wh_dimension_english": {
    "person": "who",
    "place": "where",
    "thing": "what",
    "time": "when",
    "cause": "why",
    "manner": "how",
    "count": "how many"
  },
  "wh_quantity_dimensions": [],
  "modal_composition": {
    "ability": {
      "concepts": [
        "know"
      ],
      "forms": [
        "hu"
      ]
    },
    "necessity": {
      "concepts": [
        "need"
      ],
      "forms": [
        "les"
      ]
    },
    "possibility": {
      "concepts": [
        "maybe"
      ],
      "forms": [
        "ketnat"
      ]
    },
    "inability": {
      "concepts": [
        "logic_not"
      ],
      "forms": [
        "no"
      ]
    }
  },
  "modal_unmarked": {
    "request": "An interrogative 'can you...?' is a request, and the question already carries it. Measured: 39 of 75 corpus 'can' phrases.",
    "proposal": "'We can X' proposing a joint action invites rather than claims skill. Marking it with 'know' would say we know how to walk. Roughly 25 corpus phrases.",
    "inability": "Plain negation suffices. 11 of 12 negated modals in the corpus are 'cannot'."
  },
  "modal_blocked": {
    "should": "Weak obligation. Routing it through 'need' inverts under negation: 'should not go' forbids, while 'need not go' permits. A tracked gap beats a reversed sentence.",
    "permission": "Permission-granting 'you can keep this'. No approved root separates granting from merely stating, and the sense is 5 corpus phrases."
  },
  "disjunction": {
    "marker_concept": "one",
    "marker_form": "lu",
    "english": [
      "or",
      "either"
    ],
    "conjunction_english": [
      "and"
    ]
  },
  "lexicalized": {
    "unknown": {
      "form": "nohu",
      "composition": [
        "logic_not",
        "know"
      ],
      "part_forms": [
        "no",
        "hu"
      ],
      "gloss": "unknown; a value that is not known"
    }
  },
  "particles": [
    {
      "id": "pronoun_i",
      "form": "mi"
    },
    {
      "id": "tense_past",
      "form": "ta"
    },
    {
      "id": "tense_present",
      "form": null
    },
    {
      "id": "tense_future",
      "form": "sa"
    },
    {
      "id": "logic_not",
      "form": "no"
    },
    {
      "id": "logic_yes",
      "form": "ya"
    },
    {
      "id": "logic_if",
      "form": "von"
    },
    {
      "id": "clause_question",
      "form": "ka"
    }
  ],
  "ring_by_concept": {
    "person": "communicative_core",
    "self": "communicative_core",
    "addressee": "communicative_core",
    "body": "communicative_core",
    "eat": "communicative_core",
    "drink": "communicative_core",
    "food": "communicative_core",
    "sleep": "communicative_core",
    "pain": "communicative_core",
    "sick": "communicative_core",
    "hot": "communicative_core",
    "cold": "communicative_core",
    "see": "communicative_core",
    "hear": "communicative_core",
    "speak": "communicative_core",
    "touch": "communicative_core",
    "hand": "communicative_core",
    "head": "communicative_core",
    "need": "communicative_core",
    "want": "communicative_core",
    "feel": "communicative_core",
    "good": "communicative_core",
    "bad": "communicative_core",
    "fear": "communicative_core",
    "love": "communicative_core",
    "thing": "communicative_core",
    "name": "communicative_core",
    "move": "communicative_core",
    "here": "communicative_core",
    "there": "communicative_core",
    "place": "communicative_core",
    "path": "communicative_core",
    "inside": "communicative_core",
    "outside": "communicative_core",
    "near": "communicative_core",
    "far": "communicative_core",
    "up": "communicative_core",
    "down": "communicative_core",
    "left": "communicative_core",
    "right": "communicative_core",
    "water": "communicative_core",
    "fire": "communicative_core",
    "give": "communicative_core",
    "take": "communicative_core",
    "help": "communicative_core",
    "collective": "communicative_core",
    "before": "communicative_core",
    "now": "communicative_core",
    "know": "communicative_core",
    "do": "communicative_core",
    "after": "extended_core",
    "air": "extended_core",
    "angry": "extended_core",
    "animal": "extended_core",
    "around": "extended_core",
    "back": "extended_core",
    "big": "extended_core",
    "bond": "extended_core",
    "bone": "extended_core",
    "calm": "extended_core",
    "child": "extended_core",
    "conflict": "extended_core",
    "dark": "extended_core",
    "earth": "extended_core",
    "eye": "extended_core",
    "fast": "extended_core",
    "front": "extended_core",
    "happy": "extended_core",
    "heart": "extended_core",
    "hold": "extended_core",
    "hope": "extended_core",
    "life": "extended_core",
    "light": "extended_core",
    "make": "extended_core",
    "many": "extended_core",
    "mouth": "extended_core",
    "one": "extended_core",
    "parent": "extended_core",
    "plant": "extended_core",
    "rule": "extended_core",
    "sad": "extended_core",
    "same": "extended_core",
    "skin": "extended_core",
    "sky": "extended_core",
    "small": "extended_core",
    "smell": "extended_core",
    "some": "extended_core",
    "stone": "extended_core",
    "straight": "extended_core",
    "taste": "extended_core",
    "think": "extended_core",
    "through": "extended_core",
    "time": "extended_core",
    "tree": "extended_core",
    "true": "extended_core",
    "trust": "extended_core",
    "understand": "extended_core",
    "use": "extended_core",
    "wait": "extended_core",
    "work": "extended_core",
    "aggression": "fluent_core",
    "all": "fluent_core",
    "bound": "fluent_core",
    "cause": "fluent_core",
    "center": "fluent_core",
    "change": "fluent_core",
    "count": "fluent_core",
    "depression": "fluent_core",
    "empty": "fluent_core",
    "equal": "fluent_core",
    "exclude": "fluent_core",
    "flow": "fluent_core",
    "form": "fluent_core",
    "include": "fluent_core",
    "journey": "fluent_core",
    "joy": "fluent_core",
    "justice": "fluent_core",
    "less": "fluent_core",
    "lonely": "fluent_core",
    "mark": "fluent_core",
    "metal": "fluent_core",
    "more": "fluent_core",
    "motion": "fluent_core",
    "part": "fluent_core",
    "point": "fluent_core",
    "proud": "fluent_core",
    "reach": "fluent_core",
    "scared": "fluent_core",
    "source": "fluent_core",
    "still": "fluent_core",
    "strong": "fluent_core",
    "substance": "fluent_core",
    "surface": "fluent_core",
    "timid": "fluent_core",
    "travel": "fluent_core",
    "will": "fluent_core"
  },
  "ring_caps": {
    "ring_1": 50,
    "ring_2_cumulative": 100,
    "ring_3_cumulative": 150
  }
});

export default LANGUAGE_POLICY;
