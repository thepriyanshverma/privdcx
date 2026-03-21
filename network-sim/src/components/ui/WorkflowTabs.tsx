import { Layout, Rocket, Activity, CircleDollarSign } from 'lucide-react';
import { useDeploymentToolsStore, type DeploymentWorkflow } from '../../store/useDeploymentToolsStore';

export const WorkflowTabs = () => {
  const activeWorkflow = useDeploymentToolsStore(s => s.activeWorkflow);
  const setActiveWorkflow = useDeploymentToolsStore(s => s.setActiveWorkflow);

  const workflows: { id: DeploymentWorkflow; icon: any; label: string }[] = [
    { id: 'layout', icon: <Layout className="w-4 h-4" />, label: 'Layout' },
    { id: 'deployment', icon: <Rocket className="w-4 h-4" />, label: 'Deployment' },
    { id: 'operations', icon: <Activity className="w-4 h-4" />, label: 'Operations' },
    { id: 'finance', icon: <CircleDollarSign className="w-4 h-4" />, label: 'Finance' },
  ];

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 p-1 bg-[#161b22]/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        {workflows.map((wf) => (
          <button
            key={wf.id}
            onClick={() => setActiveWorkflow(wf.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all text-xs font-bold tracking-tight uppercase ${
              activeWorkflow === wf.id
                ? 'bg-cad-blue text-white shadow-[0_0_20px_rgba(30,144,255,0.3)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <div className={activeWorkflow === wf.id ? 'text-white' : 'text-slate-500'}>
              {wf.icon}
            </div>
            {wf.label}
          </button>
        ))}
      </div>
    </div>
  );
};
