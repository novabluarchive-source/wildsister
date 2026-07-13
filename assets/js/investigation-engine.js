// =======================================================
// WILD SISTER
// SID INVESTIGATION ENGINE
// Version 1.0
// =======================================================

window.InvestigationEngine = {

    // Return the active Supabase session
    async getSession() {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            console.error(error);
            return null;
        }

        return data.session;
    },

    // Return the logged in user
    async getUser() {
        const session = await this.getSession();

        if (!session) {
            return null;
        }

        return session.user;
    },

    // Generate a SID Case Number
    createCaseNumber() {

        const date = new Date();

        const year = date.getFullYear();

        const random = Math.random()
            .toString(36)
            .substring(2,8)
            .toUpperCase();

        return `SID-${year}-${random}`;

    }

};
