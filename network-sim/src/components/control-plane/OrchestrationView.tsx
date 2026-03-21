import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Database, Layout, Building2, Map, Wind, Columns, Box, FileText, Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

type ResourceType = 'Organization' | 'Workspace' | 'Facility' | 'Data Hall' | 'Cooling Zone' | 'Aisle' | 'Rack' | 'Device Template' | 'Device';

const RESOURCES: { type: ResourceType, icon: any, endpoint: string }[] = [
  { type: 'Organization', icon: Building2, endpoint: '/tenants/organizations' },
  { type: 'Workspace', icon: Layout, endpoint: '/tenants/workspaces' },
  { type: 'Facility', icon: Database, endpoint: '/facilities' },
  { type: 'Data Hall', icon: Map, endpoint: '/facilities/halls' },
  { type: 'Cooling Zone', icon: Wind, endpoint: '/facilities/zones' },
  { type: 'Aisle', icon: Columns, endpoint: '/facilities/aisles' },
  { type: 'Rack', icon: Box, endpoint: '/racks' },
  { type: 'Device Template', icon: FileText, endpoint: '/device/device-templates' },
  { type: 'Device', icon: Smartphone, endpoint: '/device/inventory' },
];

export const OrchestrationView: React.FC = () => {
  const [selectedType, setSelectedType] = useState<ResourceType>('Organization');
  const [formData, setFormData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const token = useAuthStore(s => s.token);
  const currentWorkspaceId = useAuthStore(s => s.currentWorkspaceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccess(null);
    setError(null);

    const resource = RESOURCES.find(r => r.type === selectedType);
    if (!resource) return;

    // Auto-inject Workspace ID if required and present
    const payload = { ...formData };
    if (currentWorkspaceId && (
        selectedType === 'Facility' || 
        selectedType === 'Rack' || 
        selectedType === 'Device' || 
        selectedType === 'Device Template'
    )) {
      payload.workspace_id = currentWorkspaceId;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/v1${resource.endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || `Failed to create ${selectedType}`);
      }

      const data = await response.json();
      setSuccess(`Successfully created ${selectedType}: ${data.id || data.name}`);
      setFormData({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <header>
        <h2 className="text-3xl font-bold text-white mb-2">Platform Orchestration</h2>
        <p className="text-[#8E95A2]">Provision and scale infrastructure across the global fabric</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Selector */}
        <div className="space-y-2">
            <p className="text-[10px] text-[#4A5568] uppercase font-bold tracking-widest mb-4 px-2">Resource Type</p>
            {RESOURCES.map(res => (
                <button
                    key={res.type}
                    onClick={() => {
                        setSelectedType(res.type);
                        setFormData({});
                        setSuccess(null);
                        setError(null);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm ${
                        selectedType === res.type 
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' 
                        : 'text-[#8E95A2] hover:text-white hover:bg-white/5'
                    }`}
                >
                    <res.icon className="w-4 h-4" />
                    {res.type}
                </button>
            ))}
        </div>

        {/* Form Area */}
        <div className="lg:col-span-3">
            <motion.div 
                key={selectedType}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#151921] border border-[#2D343F] rounded-2xl shadow-xl overflow-hidden"
            >
                <div className="p-6 border-b border-[#2D343F] bg-[#1A1F29]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            {React.createElement(RESOURCES.find(r => r.type === selectedType)?.icon || Plus, { className: "w-5 h-5 text-blue-400" })}
                        </div>
                        <div>
                            <h3 className="text-white font-bold">New {selectedType}</h3>
                            <p className="text-[#8E95A2] text-xs">Configure properties for the new resource</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormFields type={selectedType} data={formData} onChange={(d) => setFormData(d)} />
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            {success}
                        </div>
                    )}

                    <div className="pt-6 border-t border-[#2D343F] flex justify-end">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-8 py-2.5 rounded-xl transition-all flex items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Create {selectedType}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
      </div>
    </div>
  );
};

const FormFields: React.FC<{ type: ResourceType, data: any, onChange: (d: any) => void }> = ({ type, data, onChange }) => {
    const update = (key: string, val: any) => onChange({ ...data, [key]: val });

    const Input = ({ label, name, type = 'text', placeholder = '' }: any) => (
        <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#8E95A2] uppercase tracking-wider">{label}</label>
            <input 
                type={type}
                required
                value={data[name] || ''}
                onChange={(e) => update(name, type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#0B0F14] border border-[#2D343F] rounded-xl px-4 py-2.5 text-white placeholder-[#4A5568] focus:outline-none focus:border-blue-500 transition-all font-medium"
            />
        </div>
    );

    switch (type) {
        case 'Organization':
            return (
                <>
                    <Input label="Organization Name" name="name" placeholder="Acme Global" />
                    <Input label="Billing Email" name="billing_email" placeholder="billing@acme.com" />
                </>
            );
        case 'Workspace':
            return (
                <>
                    <Input label="Workspace Name" name="name" placeholder="Cloud Production" />
                    <Input label="Organization ID" name="organization_id" placeholder="UUID from Orgs" />
                    <Input label="Region" name="region" placeholder="us-east-1" />
                </>
            );
        case 'Facility':
            return (
                <>
                    <Input label="Facility Name" name="name" placeholder="Santa Clara DC-1" />
                    <Input label="Width (m)" name="width_m" type="number" placeholder="20" />
                    <Input label="Length (m)" name="length_m" type="number" placeholder="30" />
                    <Input label="Height (m)" name="height_m" type="number" placeholder="4.5" />
                    <Input label="Cooling Type" name="cooling_type" placeholder="air" />
                </>
            );
        case 'Data Hall':
            return (
                <>
                    <Input label="Hall Name" name="name" placeholder="Hall A" />
                    <Input label="Facility ID" name="facility_id" />
                    <Input label="Width (m)" name="width_m" type="number" placeholder="10" />
                    <Input label="Length (m)" name="length_m" type="number" placeholder="20" />
                    <Input label="Height (m)" name="height_m" type="number" placeholder="4.0" />
                    <Input label="Power Capacity (MW)" name="power_capacity_mw" type="number" placeholder="2.5" />
                </>
            );
        case 'Cooling Zone':
            return (
                <>
                    <Input label="Zone Name" name="name" placeholder="Zone Blue" />
                    <Input label="Hall ID" name="hall_id" />
                    <Input label="Zone Type" name="zone_type" placeholder="cooling" />
                    <Input label="Cooling (kW)" name="cooling_capacity_kw" type="number" placeholder="500" />
                    <Input label="Power (kW)" name="power_capacity_kw" type="number" placeholder="400" />
                </>
            );
        case 'Aisle':
            return (
                <>
                    <Input label="Zone ID" name="zone_id" />
                    <Input label="Aisle Type" name="aisle_type" placeholder="hot" />
                    <Input label="Orientation" name="orientation" placeholder="north_south" />
                    <Input label="Width (m)" name="width_m" type="number" placeholder="1.2" />
                </>
            );
        case 'Rack':
            return (
                <>
                    <Input label="Rack Name" name="name" placeholder="Rack-A01" />
                    <Input label="Facility ID" name="facility_id" />
                    <Input label="Hall ID" name="hall_id" />
                    <Input label="Zone ID" name="zone_id" />
                    <Input label="Aisle ID" name="aisle_id" />
                    <Input label="PosX (m)" name="position_x_m" type="number" />
                    <Input label="PosY (m)" name="position_y_m" type="number" />
                    <Input label="Height (U)" name="height_u" type="number" placeholder="42" />
                    <Input label="Max Power (kW)" name="max_power_kw" type="number" placeholder="12.5" />
                </>
            );
        case 'Device Template':
            return (
                <>
                    <Input label="Template Name" name="name" placeholder="Compute Node" />
                    <Input label="Device Type" name="device_type" placeholder="server" />
                    <Input label="Vendor" name="vendor" placeholder="Dell" />
                    <Input label="Model" name="model" placeholder="PowerEdge R740" />
                    <Input label="Size (U)" name="size_u" type="number" placeholder="2" />
                    <Input label="Wattage (kW)" name="default_power_kw" type="number" placeholder="0.5" />
                </>
            );
        case 'Device':
            return (
                <>
                    <Input label="Rack ID" name="rack_id" />
                    <Input label="Template ID" name="template_id" />
                    <Input label="Vendor" name="vendor" placeholder="Dell" />
                    <Input label="Model" name="model" placeholder="PowerEdge R740" />
                    <Input label="Start U" name="start_u" type="number" placeholder="1" />
                    <Input label="Size (U)" name="size_u" type="number" placeholder="2" />
                    <Input label="Power (kW)" name="power_draw_kw" type="number" placeholder="0.4" />
                    <Input label="Max Power (kW)" name="max_power_kw" type="number" placeholder="0.6" />
                    <Input label="Heat (BTU)" name="heat_output_btu" type="number" placeholder="1400" />
                </>
            );
        default:
            return null;
    }
}
