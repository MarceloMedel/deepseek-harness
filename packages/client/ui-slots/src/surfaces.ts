/**
 * Named surfaces: the activation contract for graph rows that are not mounted
 * at boot.
 *
 * A client row whose package declares `dsh.client.surface` stays unmounted —
 * and its bundle unfetched — until a feature opens that surface. The row's
 * owning package declares the surface name; the feature that renders the
 * surface names only the surface. Neither knows the other's package, so the
 * join lives in the host graph rather than in an import between plugins.
 *
 * The web shell kernel provides the implementation on the root context before
 * any entry exists; consumers declare it in `inject`, like any other service.
 * The contract lives here because this module is the composition seam every
 * feature package already consumes.
 * @module @deepseek-ai/dsh-client-ui-slots/surfaces
 */

import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Surface activation service, provided by the web shell kernel. */
    clientSurfaces: ClientSurfaces
  }
}

/** Activation of the client rows one surface is composed of. */
export interface ClientSurfaces {
  /**
   * Mount every graph row that declares this surface and resolve once they are
   * active. Repeated calls for one surface share the first attempt.
   * @param name - surface name, as declared by `dsh.client.surface`.
   * @returns resolves when every row of the surface is active; rejects when no
   * row declares the surface, a bundle fails to import, or a row fails to
   * activate.
   */
  open: (name: string) => Promise<void>
  /**
   * Whether any graph row declares this surface, without mounting or fetching
   * anything. A feature that offers an entry point into a surface uses this to
   * decide whether to show it at all, so a deployment that does not compose the
   * row does not offer a dead affordance.
   * @param name - surface name, as declared by `dsh.client.surface`.
   * @returns true when at least one row of the boot graph declares the surface.
   */
  has: (name: string) => boolean
}
