import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (estável desde o Next 16). Além do modelo de cache no
  // servidor (`use cache`/`cacheLife`), é ele que faz o Next trocar rota usando
  // o <Activity> do React: a rota anterior é ESCONDIDA em vez de desmontada,
  // então o estado dos componentes sobrevive à navegação.
  //
  // É por isso que ele entra aqui: era esse o problema do esqueleto reaparecendo
  // a cada visita. A doc (guides/preserving-ui-state) diz na primeira linha que
  // guardar esse estado num store externo é o workaround de ANTES do Cache
  // Components — que foi exatamente o que eu tinha feito com o view-cache.
  cacheComponents: true,
};

export default nextConfig;
