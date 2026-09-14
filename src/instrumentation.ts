// Ponto de entrada da instrumentação. Mantido MÍNIMO de propósito.
//
// `register()` é chamada em TODOS os runtimes (Node e Edge). O preload da
// config toca o Postgres, e o cliente `postgres` importa `net`/`tls`, que não
// existem no Edge — importar isso aqui, mesmo dentro de um `if`, faz o bundler
// puxar o grafo inteiro para o bundle do Edge e o build quebra com
// "Module not found: Can't resolve 'net'".
//
// A separação em arquivo próprio é o padrão da doc da versão instalada
// (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md): é o
// `await import()` de um MÓDULO SEPARADO que dá ao bundler o limite por
// runtime. O guard sozinho não dá — ele vale em tempo de execução, e o
// problema é de tempo de build.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
