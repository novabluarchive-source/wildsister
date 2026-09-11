// SID // Official analyst registry
(function (global) {
  "use strict";

  const analysts = Object.freeze({
    CENTRA: Object.freeze({ division: "FORENSIC ASTROLOGY", rule: "Separate chart calculation and observed data from interpretation." }),
    LUX: Object.freeze({ division: "ORIGINAL TEXT", rule: "Separate original text, translation, historical interpretation, and modern interpretation." }),
    CIPHER: Object.freeze({ division: "NUMERIC INTELLIGENCE", rule: "Show calculations. Numeric coincidence alone does not establish meaning." }),
    SCAR: Object.freeze({ division: "SHADOW BEHAVIOR", rule: "Describe observable patterns without presenting psychological diagnosis as fact." }),
    ASH: Object.freeze({ division: "SYMBOL ARCHIVE", rule: "Separate historical symbolism from modern or projective interpretation." }),
    LUNA: Object.freeze({ division: "LUNAR INTELLIGENCE", rule: "Separate timing and cycle observations from symbolic interpretation." }),
    NIX: Object.freeze({ division: "CROSS-SYSTEM REVIEW", rule: "Audit independence, contradiction, and convergence without creating evidence." })
  });

  function get(code) {
    return analysts[String(code || "").trim().toUpperCase()] || null;
  }

  global.SIDAnalystRegistry = Object.freeze({ analysts, get, codes: Object.freeze(Object.keys(analysts)) });
})(window);
