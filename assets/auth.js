// =======================================================
// WILD SISTER
// SHARED AUTHENTICATION MODULE
// Version 1.0
// =======================================================

window.WildSisterAuth = {

  async getSession() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      return null;
    }

    return data.session;
  },

  async getUser() {
    const session = await this.getSession();
    return session ? session.user : null;
  },

  async requireUser(redirect = "login.html") {
    const user = await this.getUser();

    if (!user) {
      window.location.href = redirect;
      return null;
    }

    return user;
  },

  async getSubscription() {
    const user = await this.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Subscription error:", error);
      return null;
    }

    return data;
  },

  async getAccessState() {
    const user = await this.getUser();

    if (!user) {
      return {
        role: "visitor",
        signedIn: false,
        canSaveCases: false,
        canUsePremium: false
      };
    }

    const subscription = await this.getSubscription();

    const active =
      subscription &&
      String(subscription.status || "").toLowerCase() === "active";

    return {
      role: active ? "member" : "signed_in",
      signedIn: true,
      user,
      subscription,
      canSaveCases: true,
      canUsePremium: Boolean(active)
    };
  },

  async signOut(redirect = "index.html") {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error("Sign-out error:", error);
      return false;
    }

    window.location.href = redirect;
    return true;
  }

};
