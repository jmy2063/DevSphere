import {Component,StrictMode,type ErrorInfo,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';

/** 렌더링 중 예외가 나도 빈 화면 대신 안내와 복구 수단을 보여주는 최상위 경계 */
class ErrorBoundary extends Component<{children:ReactNode},{error:Error|null}>{
  state={error:null as Error|null};

  static getDerivedStateFromError(error:Error){return {error}}

  componentDidCatch(error:Error,info:ErrorInfo){
    console.error('[DevSphere AX] 렌더링 오류',error,info.componentStack);
  }

  render(){
    if(!this.state.error)return this.props.children;
    return <main>
      <div className="error-banner" role="alert">
        <span>화면을 표시하는 중 오류가 발생했습니다: {this.state.error.message}</span>
        <button onClick={()=>window.location.reload()}>새로고침</button>
      </div>
    </main>;
  }
}

const container=document.getElementById('root');
if(!container)throw new Error('#root 요소를 찾을 수 없습니다. index.html을 확인해주세요.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App/>
    </ErrorBoundary>
  </StrictMode>
);
