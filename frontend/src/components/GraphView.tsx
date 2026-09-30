import type {Edge,Node,NodeType} from '../lib/api';

const COLORS:Record<string,string>={CONTROLLER:'#3b82f6',SERVICE:'#14b8a6',REPOSITORY:'#8b5cf6',ENTITY:'#0ea5e9',API:'#f59e0b',TEST:'#22c55e',METHOD:'#64748b',TABLE:'#ef4444',CLASS:'#94a3b8',PROJECT:'#0f172a',PACKAGE:'#64748b'};
const GROUPS:NodeType[]=['CONTROLLER','SERVICE','METHOD','REPOSITORY','ENTITY','TABLE','API','TEST'];
const GROUP_LIMIT:Partial<Record<NodeType,number>>={METHOD:12,CONTROLLER:8,SERVICE:8,REPOSITORY:8,ENTITY:8,TABLE:8,API:8,TEST:8};

export default function GraphView({nodes,edges,selected,onSelect}:{nodes:Node[];edges:Edge[];selected?:string;onSelect:(id:string)=>void}){
  const selectedNode=selected?nodes.find(n=>n.id===selected):undefined;
  const selectedNeighborIds=new Set<string>();
  if(selected){
    edges.forEach(e=>{
      if(e.source===selected)selectedNeighborIds.add(e.target);
      if(e.target===selected)selectedNeighborIds.add(e.source);
    });
  }

  // Balanced sampling prevents METHOD-heavy projects from hiding Controller/API/Data/Test columns.
  const picked:Node[]=[];
  for(const type of GROUPS){
    const candidates=nodes.filter(n=>n.type===type);
    const prioritized=[
      ...candidates.filter(n=>n.id===selected),
      ...candidates.filter(n=>n.id!==selected&&selectedNeighborIds.has(n.id)),
      ...candidates.filter(n=>n.id!==selected&&!selectedNeighborIds.has(n.id)),
    ];
    picked.push(...prioritized.slice(0,GROUP_LIMIT[type]??8));
  }
  if(selectedNode&&GROUPS.includes(selectedNode.type)&&!picked.some(n=>n.id===selectedNode.id)) picked.push(selectedNode);

  const visible=[...new Map(picked.map(n=>[n.id,n])).values()];
  const visibleIds=new Set(visible.map(n=>n.id));
  const visibleEdges=edges.filter(e=>visibleIds.has(e.source)&&visibleIds.has(e.target));
  const neighbors=new Set<string>();
  visibleEdges.forEach(e=>{if(e.source===selected)neighbors.add(e.target);if(e.target===selected)neighbors.add(e.source)});

  const width=1080,height=460,paddingX=62;
  const columns=new Map<string,Node[]>(); GROUPS.forEach(t=>columns.set(t,visible.filter(n=>n.type===t)));
  const positions=new Map<string,{x:number;y:number}>();
  GROUPS.forEach((type,col)=>{
    const list=columns.get(type)||[]; const x=paddingX+col*((width-paddingX*2)/(GROUPS.length-1));
    list.forEach((node,row)=>{const gap=Math.min(62,(height-82)/Math.max(list.length,1));const y=48+(row+.5)*gap;positions.set(node.id,{x,y})});
  });

  return <div className="graph-card">
    <div className="graph-legend">{GROUPS.map(t=><span key={t}><i style={{background:COLORS[t]}}/>{t}</span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Software Knowledge Graph">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5a7890"/></marker></defs>
      {visibleEdges.map((edge,i)=>{const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)return null;const active=selected===edge.source||selected===edge.target;return <line key={`${edge.source}-${edge.target}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={active?'edge active':'edge'} markerEnd="url(#arrow)"/>})}
      {visible.map(node=>{const p=positions.get(node.id);if(!p)return null;const isSelected=selected===node.id;const dim=Boolean(selected&&!isSelected&&!neighbors.has(node.id));return <g key={node.id} onClick={()=>onSelect(node.id)} className="node" opacity={dim ? 0.3 : 1} role="button" aria-label={`${node.type} ${node.name}`}>
        <circle cx={p.x} cy={p.y} r={isSelected?18:13} fill={COLORS[node.type]||'#64748b'} className={isSelected?'selected-node':''}/>
        <text x={p.x} y={p.y+29} textAnchor="middle" className="node-label">{shorten(node.name,node.type==='METHOD'?22:18)}</text>
      </g>})}
    </svg>
    {nodes.length>visible.length&&<div className="graph-note">가독성을 위해 유형별 핵심 노드를 균형 있게 표시합니다. 선택한 노드와 인접 관계를 우선하며 전체 Graph는 분석 엔진에 유지됩니다.</div>}
  </div>
}
function shorten(value:string,max:number){return value.length>max?value.slice(0,max-1)+'…':value}
