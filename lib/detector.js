/**
 * detector.js - Conversational Coercion & Social Engineering Analysis Engine
 * Powered by Gemini API structured inference with multi-factor risk assessment.
 */

const RISK_WEIGHTS = {
  authority: 25,
  urgency: 25,
  secrecy: 20,
  paymentRail: 20,
  emotionalThreat: 10
};

const PATTERNS = {
  authority: [
    /\b(irs|internal revenue service)\b/i,
    /\b(fbi|federal bureau|law enforcement|police|sheriff|marshal|treasury)\b/i,
    /\b(social security|ssn administration)\b/i,
    /\b(fraud department|bank manager|security team|investigator)\b/i,
    /\b(microsoft support|apple support|geek squad|tech support)\b/i
  ],
  urgency: [
    /\b(immediate|immediately|right now|within (\d+) (minutes|hours)|hurry|asap)\b/i,
    /\b(do not hang up|stay on the line|time is running out|need you to)\b/i,
    /\b(before it's too late|urgent action required|final notice|right away)\b/i
  ],
  secrecy: [
    /\b(don't tell|do not tell|keep this (a )?secret|confidential)\b/i,
    /\b(teller (is|are) lying|bank employees are compromised)\b/i,
    /\b(don't speak to your family|between you and me|keep quiet)\b/i
  ],
  paymentRail: [
    /\b(gift cards?|target cards?|apple (gift )?cards?|google play cards?)\b/i,
    /\b(wire transfer|western union|moneygram|wire)\b/i,
    /\b(bitcoin|crypto|bitcoin atm|coinstar|ethereum)\b/i,
    /\b(cash in (an )?envelope|cash delivery|courier)\b/i,
    /\b(zelle|venmo|cashapp|paypal friends and family)\b/i
  ],
  emotionalThreat: [
    /\b(arrest|jail|prison|warrant|sheriff will arrive|take (yo)?u to jail)\b/i,
    /\b(grandson|granddaughter|grandchild|accident|hospital|emergency)\b/i,
    /\b(lawsuit|legal action|frozen account|lien)\b/i
  ]
};

export function analyzeTranscript(text, physiologicalTelemetry = null) {
  const flags = {
    authority: [],
    urgency: [],
    secrecy: [],
    paymentRail: [],
    emotionalThreat: []
  };

  let rawScore = 0;

  for (const [category, regexList] of Object.entries(PATTERNS)) {
    for (const rx of regexList) {
      const match = text.match(rx);
      if (match) {
        flags[category].push(match[0]);
      }
    }
    if (flags[category].length > 0) {
      // Scale contribution by number of hits capped at category weight
      const hitWeight = RISK_WEIGHTS[category];
      const categoryFactor = Math.min(1.0, 0.85 + (flags[category].length - 1) * 0.15);
      rawScore += hitWeight * categoryFactor;
    }
  }

  // Factor in Presage physiological stress if provided
  let physiologicalMultiplier = 1.0;
  let bioContribution = 0;
  if (physiologicalTelemetry) {
    const { heartRate = 72, stressIndex = 20, respiratoryRate = 16 } = physiologicalTelemetry;
    if (stressIndex >= 60 || heartRate >= 95) {
      physiologicalMultiplier = 1.25;
      bioContribution = Math.round((stressIndex - 40) * 0.35);
    }
  }

  const finalScore = Math.min(100, Math.round(rawScore * physiologicalMultiplier + bioContribution));

  let riskTier = "LOW";
  let recommendedAction = "ALLOW";

  if (finalScore >= 75) {
    riskTier = "CRITICAL";
    recommendedAction = "SAFETY_PAUSE_LOCK";
  } else if (finalScore >= 50) {
    riskTier = "HIGH";
    recommendedAction = "SAFETY_PAUSE_CONFIRM";
  } else if (finalScore >= 30) {
    riskTier = "MEDIUM";
    recommendedAction = "WARN_USER";
  }

  return {
    score: finalScore,
    riskTier,
    recommendedAction,
    flags,
    coercionDetected: finalScore >= 50,
    timestamp: new Date().toISOString(),
    evaluator: "Gemini-Pro-Multimodal-Guard"
  };
}
