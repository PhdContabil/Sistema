/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // mupdf (WASM + bindings nativos) e tesseract.js (spawna worker_threads e
  // resolve o script do worker/traineddata por caminho em disco) quebram
  // quando o webpack do Next tenta empacotá-los junto com as rotas da API —
  // é assim que aparece o erro genérico "e is not a function" ao processar
  // a Certidão de Inteiro Teor em produção (a extração funciona normalmente
  // rodando os dois direto em Node, fora do bundle do Next). Isso diz pro
  // Next tratar os dois como pacotes externos: exigidos via `require`/
  // `import` normal do node_modules em runtime, sem passar pelo bundler.
  experimental: {
    serverComponentsExternalPackages: ["mupdf", "tesseract.js"],
    // O "por.traineddata" do Tesseract é lido via `process.cwd()` em runtime
    // (lib/robo-zen/certidao-parser.ts), não por um require/import literal —
    // então o rastreamento automático de arquivos do Vercel não teria como
    // descobrir sozinho que esse arquivo precisa ir junto da função. Sem
    // isso, o deploy funcionaria, mas o OCR falharia por não achar o idioma
    // "por" assim que caísse no fallback de PDF escaneado.
    //
    // O mesmo vale pros próprios binários .wasm do motor do Tesseract
    // (tesseract.js-core): o rastreamento automático pegou só os arquivos
    // .js "carregadores" de cada variante (simd/lstm/simd-lstm/plano), mas
    // não os .wasm que eles carregam em runtime (o loader Emscripten
    // resolve o caminho de um jeito que o rastreador estático não segue) —
    // confirmado em produção: "ENOENT ... tesseract-core-simd.wasm" bem no
    // meio do OCR, o que também explica o 504 (a função ficava presa
    // tentando lidar com esse erro até estourar os 60s). Sem os .wasm,
    // nenhuma variante do motor consegue carregar.
    outputFileTracingIncludes: {
      "/api/paralegal/robo-zen/**": [
        "./lib/robo-zen/tessdata/**/*",
        "./node_modules/tesseract.js-core/*.wasm",
      ],
    },
  },
};

export default nextConfig;
