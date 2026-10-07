declare module 'react' {
  export type ReactNode = JSX.Element | string | number | boolean | null | undefined | Iterable<ReactNode>;
  export type SetStateAction<T> = T | ((prev:T)=>T);
  export type Dispatch<A> = (value:A)=>void;

  export interface ChangeEvent<T = Element> { target:T; currentTarget:T; }
  export interface DragEvent<T = Element> {
    target:T; currentTarget:T;
    dataTransfer:{ files:FileList };
    preventDefault():void;
  }
  export interface MouseEvent<T = Element> { target:T; currentTarget:T; preventDefault():void; }

  export function useState<T>(initial:T): [T, Dispatch<SetStateAction<T>>];
  export function useEffect(effect:()=>void|(()=>void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory:()=>T, deps: readonly unknown[]): T;
  export function useRef<T>(initial:T|null): {current:T|null};
  const React: { StrictMode:(props:any)=>any };
  export default React;
}

declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type:any, props:any, key?:any): any;
  export function jsxs(type:any, props:any, key?:any): any;
}

type _InputProps = {
  onChange?: (e: import('react').ChangeEvent<HTMLInputElement>) => void;
  [key:string]: any;
};
type _SelectProps = {
  onChange?: (e: import('react').ChangeEvent<HTMLSelectElement>) => void;
  [key:string]: any;
};
type _TextareaProps = {
  onChange?: (e: import('react').ChangeEvent<HTMLTextAreaElement>) => void;
  [key:string]: any;
};
type _DivProps = {
  onDragOver?: (e: import('react').DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: import('react').DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: import('react').DragEvent<HTMLDivElement>) => void;
  onClick?: (e: import('react').MouseEvent<HTMLDivElement>) => void;
  [key:string]: any;
};

declare namespace JSX {
  interface IntrinsicElements {
    input: _InputProps;
    select: _SelectProps;
    textarea: _TextareaProps;
    div: _DivProps;
    [elemName:string]: any;
  }
}
