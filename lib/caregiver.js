/**
 * caregiver.js - Trusted Contact Escalation & Two-Party Consensus Engine
 * Routes high-risk transactions to designated family contacts with biometric context.
 */

class CaregiverNetwork {
  constructor() {
    this.primaryContact = {
      name: "Sarah Souquette",
      relation: "Daughter & Power of Attorney",
      phone: "+1 (210) 555-0194",
      status: "ACTIVE"
    };

    this.pendingAuthorizations = new Map();
  }

  createEscalation(transactionDetails, riskAnalysis, biometricSnapshot) {
    const authId = "auth_" + Math.random().toString(36).substring(2, 9);
    const token = Math.floor(100000 + Math.random() * 900000).toString();

    const escalation = {
      authId,
      token,
      createdAt: new Date().toISOString(),
      status: "PENDING_CAREGIVER_REVIEW",
      recipient: transactionDetails.recipient || "Unknown Recipient",
      amount: transactionDetails.amount || 2500.00,
      riskScore: riskAnalysis.score,
      riskTier: riskAnalysis.riskTier,
      scamType: riskAnalysis.scamType || null,
      reason: riskAnalysis.reason || null,
      coercionTriggers: Object.values(riskAnalysis.flags || {}).flat(),
      vitalSigns: {
        heartRate: biometricSnapshot.heartRate,
        stressIndex: biometricSnapshot.stressIndex,
        expression: biometricSnapshot.expression || null
      },
      message: `[SWIVEL SHIELD ALERT] Dad is attempting a transfer of $${transactionDetails.amount || 2500} to '${transactionDetails.recipient || "Unknown"}'. Acute stress detected (Stress ${biometricSnapshot.stressIndex}/100${biometricSnapshot.expression ? `, looks ${biometricSnapshot.expression.toLowerCase()}` : ""}, Coercion Score ${riskAnalysis.score}/100). Reply VETO to freeze or CONFIRM to release.`
    };

    this.pendingAuthorizations.set(authId, escalation);
    return escalation;
  }

  resolveEscalation(authId, action) {
    if (!this.pendingAuthorizations.has(authId)) {
      return { success: false, reason: "NOT_FOUND" };
    }

    const item = this.pendingAuthorizations.get(authId);
    if (action === "VETO") {
      item.status = "BLOCKED_BY_CAREGIVER";
      item.resolvedAt = new Date().toISOString();
      return { success: true, status: item.status, message: "Transaction permanently cancelled and card paused." };
    } else if (action === "CONFIRM" || action === "APPROVE") {
      // "APPROVE" is the public API verb; "CONFIRM" is kept as a legacy alias.
      item.status = "CLEARED_BY_CAREGIVER";
      item.resolvedAt = new Date().toISOString();
      return { success: true, status: item.status, message: "Caregiver verified. Transfer approved to proceed." };
    }

    return { success: false, reason: "INVALID_ACTION" };
  }

  getEscalation(authId) {
    return this.pendingAuthorizations.get(authId) || null;
  }

  // Restores reviews saved in Tiger Data, so history survives a server restart.
  restore(reviews) {
    for (const item of reviews) if (item?.authId) this.pendingAuthorizations.set(item.authId, item);
  }

  // Newest first, so a second device (the caregiver's phone) can follow live alerts and history.
  getRecent(limit = 20) {
    return [...this.pendingAuthorizations.values()].reverse().slice(0, limit);
  }
}

export const caregiverNetwork = new CaregiverNetwork();
