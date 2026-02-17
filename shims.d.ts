declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, any>
  export default component
}

declare module 'pdfjs-dist/build/pdf.worker?url' {
  const workerSrc: string;
  export default workerSrc;
}
