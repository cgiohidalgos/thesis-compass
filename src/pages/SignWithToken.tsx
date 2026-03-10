import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBase } from '@/lib/utils';

export default function SignWithToken() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [signFile, setSignFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`${getApiBase()}/sign/token/${token}`);
        if (!res.ok) throw new Error('Token inválido o expirado');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token]);

  const handleDownloadPdf = async () => {
    if (!data) return;
    setLoadingPdf(true);
    try {
      const res = await fetch(`${getApiBase()}/sign/token/${token}/download-pdf`);
      if (!res.ok) throw new Error('Error descargando PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acta-${data.thesisId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleUploadPdf = async () => {
    if (!signFile) {
      alert('Selecciona un archivo PDF');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('signed_pdf', signFile);

    try {
      const res = await fetch(`${getApiBase()}/sign/token/${token}/upload-signed`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Error subiendo PDF');
      alert('PDF firmado subido exitosamente');
      setSignFile(null);
      // Opcional: redirigir a página de éxito
      navigate('/sign-success');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-6 text-center">Cargando...</div>;
  if (error) return <div className="p-6 text-center text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-6 text-center">No se encontraron datos</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-card rounded-lg shadow">
      <h1 className="text-3xl font-bold mb-2">🔐 Firma Digital con Certificado</h1>
      <p className="text-muted-foreground mb-6">
        Descargue el PDF, fírmelo con Adobe Acrobat usando su certificado digital y súbalo de vuelta.
      </p>

      <div className="mb-6 p-4 bg-blue-50 dark:bg-slate-800 rounded">
        <h2 className="font-bold mb-2">Información del Trabajo:</h2>
        <p className="text-sm mb-1"><strong>Título:</strong> {data.thesis.title}</p>
        <p className="text-sm mb-1"><strong>Estudiantes:</strong> {data.students.map((s: any) => s.name).join(', ')}</p>
        <p className="text-sm mb-1"><strong>Firmando como:</strong> {data.signerName} ({data.signerRole})</p>
      </div>

      <div className="mb-6">
        <h3 className="font-bold mb-3">Estado de firmas:</h3>
        <p className="text-sm text-muted-foreground mb-4">No hay firmas digitales registradas aún.</p>
      </div>

      <div className="space-y-4">
        <button
          onClick={handleDownloadPdf}
          disabled={loadingPdf}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 transition"
        >
          {loadingPdf ? '⏳ Descargando...' : '📥 Descargar PDF para firmar'}
        </button>

        <div className="border-t pt-4">
          <h3 className="font-bold mb-3">Subir PDF firmado:</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setSignFile(e.target.files?.[0] || null)}
              className="flex-1"
            />
            <button
              onClick={handleUploadPdf}
              disabled={!signFile || uploading}
              className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:bg-gray-400 transition w-full sm:w-auto"
            >
              {uploading ? '⏳ Subiendo...' : '📤 Subir PDF firmado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
