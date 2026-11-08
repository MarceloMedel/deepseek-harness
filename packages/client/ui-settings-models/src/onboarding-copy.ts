/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-11-06.1'

/** The complete editable internal-testing notice in the supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  es: {
    title: 'Aviso de prueba interna',
    body: 'MDL-HARNESS 0.1 sigue en fase de prueba para desarrolladores de Harness. Muchas áreas necesitan mejoras y esperamos los comentarios de la comunidad. Los plugins centrales y las API fundamentales de MDL-HARNESS seguirán evolucionando rápido en los próximos meses.\n\nEsperamos explorar los límites de la inteligencia junto a desarrolladores de todo el mundo, sobre una infraestructura abierta, reutilizable y componible. Invitamos a los desarrolladores de Harness de todas partes a sumarse al ecosistema de plugins de MDL-HARNESS.',
    continueLabel: 'Continuar',
  },
  en: {
    title: 'Internal Testing Notice',
    body: "MDL-HARNESS 0.1 remains in testing for Harness developers. Many areas need further improvement, and we welcome feedback from the developer community. MDL-HARNESS's core plugins and foundational APIs will continue to evolve rapidly over the coming months.\n\nWe look forward to exploring the limits of intelligence with developers around the world, building on open-source, open, reusable, and composable infrastructure. We welcome Harness developers everywhere to join the MDL-HARNESS plugin ecosystem.",
    continueLabel: 'Continue',
  },
} as const
