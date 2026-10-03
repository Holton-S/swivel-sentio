/**
 * voice.js - ElevenLabs Empathetic Audio Intervention Synthesizer
 * Deploys natural, emotionally calming voice audio to de-escalate coerced elderly victims.
 */

export function generateInterventionScript(analysis) {
  const { flags = {}, score = 75 } = analysis;

  if (flags.authority && flags.authority.some(a => /irs|police|sheriff|fbi/i.test(a))) {
    return {
      title: "Government Impersonation Warning",
      text: "Please pause for just a moment. Government agencies like the IRS or law enforcement will never demand immediate wire transfers or gift cards over the phone. Let's take a deep breath and call your daughter Sarah before taking any action.",
      voiceTone: "calm_authoritative",
      speakerName: "Rachel (Caregiver Voice)"
    };
  }

  if (flags.emotionalThreat && flags.emotionalThreat.some(t => /grandson|granddaughter|accident|hospital/i.test(t))) {
    return {
      title: "Family Emergency Verification Alert",
      text: "Wait a second. Scammers frequently impersonate family members in fake emergencies. Before you send any funds, let us call your family directly on their personal phone number to make sure they are safe.",
      voiceTone: "empathic_protective",
      speakerName: "Daniel (Supportive Guardian)"
    };
  }

  if (flags.paymentRail && flags.paymentRail.some(p => /gift card|bitcoin|crypto/i.test(p))) {
    return {
      title: "Unusual Payment Rail Warning",
      text: "Hold on. Legitimate businesses and organizations never ask to be paid in retail gift cards or crypto ATMs. This is a known fraud pattern. We have paused this transaction to keep your hard-earned savings secure.",
      voiceTone: "gentle_firm",
      speakerName: "Rachel (Caregiver Voice)"
    };
  }

  // General default safety pause
  return {
    title: "Safety Pause Initiated",
    text: "We noticed high pressure and unusual urgency in this transaction. Scammers rely on rushed decisions. Take a moment to step back. We are reaching out to your emergency contact right now.",
    voiceTone: "soothing_reassuring",
    speakerName: "Rachel (Caregiver Voice)"
  };
}
