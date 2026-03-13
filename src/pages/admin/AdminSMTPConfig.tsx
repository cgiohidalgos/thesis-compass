import { useState, useEffect } from 'react';
import { getApiBase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import AppLayout from '@/components/layout/AppLayout';

export default function AdminSMTPConfig() {
  const API_BASE = getApiBase();
  const { toast } = useToast();

  const [config, setConfig] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    encryption: 'TLS',
    is_default: false,
  });

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/admin/smtp-config`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, ...data, port: data.port || prev.port, is_default: !!data.is_default }));
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleSave = async () => {
    if (!config.host?.trim() || !config.port || config.port < 1 || !config.username?.trim() || !config.password?.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Todos los campos son requeridos' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/admin/smtp-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        toast({ title: 'Éxito', description: 'Configuración SMTP guardada' });
      } else {
        const error = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Error', description: error.error || 'No se pudo guardar la configuración' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Error al guardar configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/admin/smtp-config/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        toast({ title: 'Éxito', description: 'Conexión SMTP establecida correctamente' });
      } else {
        const error = await res.json();
        toast({ variant: 'destructive', title: 'Error', description: error.error || 'No se pudo conectar' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Error probando conexión' });
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    setSendingTest(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/admin/smtp-config/send-test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        const data = await res.json();
        toast({ title: 'Éxito', description: data.message || 'Email de prueba enviado' });
      } else {
        const error = await res.json();
        toast({ variant: 'destructive', title: 'Error', description: error.error || 'No se pudo enviar el email' });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Error enviando email de prueba' });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <AppLayout role="admin">
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">⚙️ Configuración SMTP</h1>
      <p className="text-muted-foreground mb-6">Configura los parámetros de correo electrónico para las notificaciones</p>

      <div className="bg-card border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Servidor SMTP</label>
          <Input
            placeholder="smtp.gmail.com"
            value={config.host}
            onChange={(e) => setConfig({ ...config, host: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Puerto</label>
          <Input
            type="number"
            placeholder="587"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 0 })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Usuario/Email</label>
          <Input
            placeholder="tu-email@gmail.com"
            value={config.username}
            onChange={(e) => setConfig({ ...config, username: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Contraseña/Token</label>
          <Input
            type="password"
            placeholder="contraseña de aplicación"
            value={config.password}
            onChange={(e) => setConfig({ ...config, password: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Encriptación</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={config.encryption}
            onChange={(e) => setConfig({ ...config, encryption: e.target.value })}
          >
            <option>TLS</option>
            <option>SSL</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="is_default"
            checked={!!config.is_default}
            onChange={(e) => setConfig({ ...config, is_default: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="is_default" className="text-sm">
            Usar como configuración del sistema (para enviar notificaciones a todos los usuarios)
          </label>
        </div>

        <div className="pt-4 flex flex-wrap gap-2">
          <Button onClick={handleTest} disabled={testing} variant="outline">
            {testing ? '⏳ Probando...' : '🔗 Probar Conexión'}
          </Button>
          <Button onClick={handleSendTestEmail} disabled={sendingTest} variant="outline">
            {sendingTest ? '⏳ Enviando...' : '📧 Enviar Email de Prueba'}
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? '⏳ Guardando...' : '💾 Guardar Configuración'}
          </Button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm">
          <p className="font-medium mb-1">📝 Ejemplo para Gmail:</p>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li>• Servidor: smtp.gmail.com</li>
            <li>• Puerto: 587</li>
            <li>• Usuario: tu-email@gmail.com</li>
            <li>• Contraseña: (contraseña de aplicación, no la contraseña normal)</li>
            <li>• Encriptación: TLS</li>
          </ul>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
