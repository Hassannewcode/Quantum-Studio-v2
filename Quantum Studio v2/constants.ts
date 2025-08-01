var _, E, L, I;

const A = {
    APP_NODE_ID: "cello-widget-app",
    API_URL: "https://share.cello.so/api",
    SIGNAL_API_URL: "https://share.cello.so/api/signal",
    ANALYTIC_API_URL: "https://share.cello.so/api-analytics",
    CDN_URL: "https://cdn.cello.so",
    CELLO_URL: "https://cello.so?app=<productid>&utm_source=cello&utm_campaign=<ucc>",
    CELLO_INTERVIEW_URL: "https://getcello.typeform.com/user-interview?app=<productid>&utm_campaign=<ucc>",
    CELLO_SUPPORT_EMAIL: "support@cello.so",
    CELLO_TERMS_OF_SERVICE_URL: "https://cello.so/terms-of-service/",
    CELLO_PRIVACY_POLICY_URL: "https://cello.so/privacy-policy-cello-platform/",
    FAB_DISPLAY_TIMEOUT: 2e3,
    ANALYTIC_API_BATCH_INTERVAL_DELAY_MS: 3e4,
    ANALYTIC_API_BATCH_INTERVAL_DELAY_MS_NATIVE: 1e3,
    DEBUG_EVENT_BATCH_INTERVAL_DELAY_MS: 1e4,
    MODAL_PORTAL_NODE_ID: "cello-widget-modal-portal",
    ERROR_PREFIX: "[Cello]: ",
    BASE_URL: "https://assets.cello.so/app/latest/",
    IFRAME_BUILD_DIRECTORY: "/iframe/"
};

export {A as c};