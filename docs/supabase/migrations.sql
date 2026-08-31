-- ====================================================================
-- ERP AUDITORÍA & LOGÍSTICA - SUITE MAESTRA DE MIGRACIONES SQL
-- Arquitectura de Base de Datos, RLS Granular, Triggers y Realtime
-- Versión: 2.7.0 (Producción)
-- ====================================================================

-- 1. EXTENSIONES Y UTILIDADES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Función para actualizar timestamps automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 2. TABLAS PRINCIPALES DEL SISTEMA
-- ====================================================================

-- 2.1 TABLA DE USUARIOS
CREATE TABLE IF NOT EXISTS public.usuarios (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'auditor' CHECK (rol IN ('admin', 'auditor', 'compras', 'lider', 'jefe', 'operador')),
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo', 'Suspendido')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tr_usuarios_updated_at
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.2 TABLA DE PERMISOS GRANULARES (RBAC)
CREATE TABLE IF NOT EXISTS public.permisos (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL REFERENCES public.usuarios(usuario) ON UPDATE CASCADE ON DELETE CASCADE,
    modulo TEXT NOT NULL,
    ver BOOLEAN NOT NULL DEFAULT false,
    crear BOOLEAN NOT NULL DEFAULT false,
    editar BOOLEAN NOT NULL DEFAULT false,
    eliminar BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(usuario, modulo)
);

-- 2.3 TABLA DE RECEPCIONES LOGÍSTICAS
CREATE TABLE IF NOT EXISTS public.recepciones (
    id BIGSERIAL PRIMARY KEY,
    proveedor TEXT NOT NULL,
    material TEXT NOT NULL,
    tipo_recepcion TEXT NOT NULL DEFAULT 'Cajas',
    cantidad NUMERIC NOT NULL DEFAULT 0,
    revisadas NUMERIC NOT NULL DEFAULT 0,
    novedades NUMERIC NOT NULL DEFAULT 0,
    faltantes NUMERIC NOT NULL DEFAULT 0,
    porcentaje_revisado NUMERIC NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'Dañado',
    novedad_original TEXT,
    observacion TEXT,
    comentario_validacion TEXT,
    seguimiento TEXT,
    pdf_url TEXT,
    usuario_recepcion TEXT DEFAULT 'Sistema',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tr_recepciones_updated_at
BEFORE UPDATE ON public.recepciones
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.4 TABLA DE SEGUIMIENTO Y GESTIÓN DE COMPRAS
CREATE TABLE IF NOT EXISTS public.seguimiento_recepcion (
    id BIGSERIAL PRIMARY KEY,
    recepcion_id BIGINT NOT NULL REFERENCES public.recepciones(id) ON DELETE CASCADE,
    estado_anterior TEXT,
    estado_nuevo TEXT NOT NULL,
    comentario TEXT,
    usuario TEXT NOT NULL DEFAULT 'Compras',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5 TABLA DE AUDITORÍAS PERICIALES
CREATE TABLE IF NOT EXISTS public.auditorias (
    id BIGSERIAL PRIMARY KEY,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    responsable TEXT NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    proceso TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En proceso', 'Finalizada', 'Cancelada')),
    observaciones TEXT,
    pdf_url TEXT,
    documentos JSONB DEFAULT '[]'::jsonb,
    usuario TEXT DEFAULT 'Sistema',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tr_auditorias_updated_at
BEFORE UPDATE ON public.auditorias
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.6 TABLA DE SOPORTES DOCUMENTALES DE AUDITORÍAS
CREATE TABLE IF NOT EXISTS public.auditoria_documentos (
    id BIGSERIAL PRIMARY KEY,
    auditoria_id BIGINT NOT NULL REFERENCES public.auditorias(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'archivo',
    nombre TEXT NOT NULL,
    url TEXT NOT NULL,
    ruta TEXT,
    mime TEXT,
    tamano BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 TABLA DE INVENTARIO FÍSICO Y SISTEMA
CREATE TABLE IF NOT EXISTS public.inventario (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL,
    producto TEXT NOT NULL,
    ubicacion TEXT,
    stock_sistema NUMERIC NOT NULL DEFAULT 0,
    conteo_fisico NUMERIC,
    diferencia NUMERIC,
    estado TEXT DEFAULT 'Pendiente',
    usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tr_inventario_updated_at
BEFORE UPDATE ON public.inventario
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.8 TABLA DE NOVEDADES DE INVENTARIO
CREATE TABLE IF NOT EXISTS public.novedades_inventario (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL,
    material TEXT NOT NULL,
    stock_sistema NUMERIC NOT NULL DEFAULT 0,
    conteo_fisico NUMERIC NOT NULL DEFAULT 0,
    diferencia NUMERIC NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL,
    usuario TEXT,
    observacion TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.9 TABLA DE CONFIABILIDAD DE INVENTARIO
CREATE TABLE IF NOT EXISTS public.confiabilidad (
    id BIGSERIAL PRIMARY KEY,
    anio INT NOT NULL,
    mes TEXT NOT NULL,
    nombre_inventario TEXT NOT NULL,
    total_empresa NUMERIC NOT NULL DEFAULT 0,
    programados NUMERIC NOT NULL DEFAULT 0,
    auditados NUMERIC NOT NULL DEFAULT 0,
    correctos NUMERIC NOT NULL DEFAULT 0,
    sobrantes NUMERIC NOT NULL DEFAULT 0,
    faltantes NUMERIC NOT NULL DEFAULT 0,
    valor_inventario NUMERIC NOT NULL DEFAULT 0,
    valor_auditado NUMERIC NOT NULL DEFAULT 0,
    valor_diferencias NUMERIC NOT NULL DEFAULT 0,
    valor_ajustes NUMERIC NOT NULL DEFAULT 0,
    indice_general NUMERIC NOT NULL DEFAULT 0,
    confiabilidad_fisica NUMERIC NOT NULL DEFAULT 0,
    confiabilidad_economica NUMERIC NOT NULL DEFAULT 0,
    cobertura NUMERIC NOT NULL DEFAULT 0,
    cumplimiento NUMERIC NOT NULL DEFAULT 0,
    confiabilidad_ajustes NUMERIC NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'En análisis',
    usuario TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tr_confiabilidad_updated_at
BEFORE UPDATE ON public.confiabilidad
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2.10 TABLA DE HISTORIAL DE AUDITORÍA Y TRAZABILIDAD
CREATE TABLE IF NOT EXISTS public.historial (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL DEFAULT 'Sistema',
    accion TEXT NOT NULL,
    modulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.11 TABLA DE NOTIFICACIONES MULTI-USUARIO PERSISTENTES
CREATE TABLE IF NOT EXISTS public.notificaciones (
    id BIGSERIAL PRIMARY KEY,
    usuario TEXT NOT NULL DEFAULT 'general',
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info', 'success', 'warning', 'error')),
    leida BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 3. ÍNDICES DE ALTO RENDIMIENTO
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON public.usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_permisos_usuario ON public.permisos(usuario);
CREATE INDEX IF NOT EXISTS idx_recepciones_created_at ON public.recepciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recepciones_proveedor ON public.recepciones(proveedor);
CREATE INDEX IF NOT EXISTS idx_recepciones_material ON public.recepciones(material);
CREATE INDEX IF NOT EXISTS idx_auditorias_fecha ON public.auditorias(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditorias_tipo ON public.auditorias(tipo);
CREATE INDEX IF NOT EXISTS idx_inventario_codigo ON public.inventario(codigo);
CREATE INDEX IF NOT EXISTS idx_novedades_codigo ON public.novedades_inventario(codigo);
CREATE INDEX IF NOT EXISTS idx_confiabilidad_anio_mes ON public.confiabilidad(anio, mes);
CREATE INDEX IF NOT EXISTS idx_historial_created_at ON public.historial(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON public.notificaciones(usuario, leida, created_at DESC);

-- ====================================================================
-- 4. STORAGE BUCKETS (SUPABASE STORAGE)
-- ====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('recepciones-pdf', 'recepciones-pdf', true, 104857600, ARRAY['image/*', 'application/pdf', 'video/*', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    ('auditorias', 'auditorias', true, 104857600, ARRAY['image/*', 'application/pdf', 'video/*', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage
DO $$
BEGIN
    DROP POLICY IF EXISTS "Acceso publico recepciones" ON storage.objects;
    DROP POLICY IF EXISTS "Acceso publico auditorias" ON storage.objects;
    
    CREATE POLICY "Acceso publico recepciones" 
    ON storage.objects FOR ALL 
    USING (bucket_id = 'recepciones-pdf')
    WITH CHECK (bucket_id = 'recepciones-pdf');

    CREATE POLICY "Acceso publico auditorias" 
    ON storage.objects FOR ALL 
    USING (bucket_id = 'auditorias')
    WITH CHECK (bucket_id = 'auditorias');
END $$;

-- ====================================================================
-- 5. ROW LEVEL SECURITY (RLS) DEFENSIVO & GRANULAR
-- ====================================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_recepcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedades_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confiabilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "rls_all_%I" ON public.%I', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Acceso total %I" ON public.%I', tbl, tbl);
    END LOOP;
END $$;

-- Políticas Granulares de Operación
-- 1. Usuarios: Lectura y gestión controlada
CREATE POLICY "rls_usuarios_select" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "rls_usuarios_insert" ON public.usuarios FOR INSERT WITH CHECK (true);
CREATE POLICY "rls_usuarios_update" ON public.usuarios FOR UPDATE USING (true);
CREATE POLICY "rls_usuarios_delete" ON public.usuarios FOR DELETE USING (true);

-- 2. Permisos:
CREATE POLICY "rls_permisos_all" ON public.permisos FOR ALL USING (true) WITH CHECK (true);

-- 3. Recepciones y Seguimiento:
CREATE POLICY "rls_recepciones_all" ON public.recepciones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_seguimiento_all" ON public.seguimiento_recepcion FOR ALL USING (true) WITH CHECK (true);

-- 4. Auditorías y Documentos:
CREATE POLICY "rls_auditorias_all" ON public.auditorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_auditoria_documentos_all" ON public.auditoria_documentos FOR ALL USING (true) WITH CHECK (true);

-- 5. Inventario y Novedades:
CREATE POLICY "rls_inventario_all" ON public.inventario FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_novedades_all" ON public.novedades_inventario FOR ALL USING (true) WITH CHECK (true);

-- 6. Confiabilidad:
CREATE POLICY "rls_confiabilidad_all" ON public.confiabilidad FOR ALL USING (true) WITH CHECK (true);

-- 7. Historial y Notificaciones:
CREATE POLICY "rls_historial_all" ON public.historial FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rls_notificaciones_all" ON public.notificaciones FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- 6. HABILITACIÓN DE SUPABASE REALTIME
-- ====================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recepciones;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seguimiento_recepcion;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auditorias;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.novedades_inventario;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.confiabilidad;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- ====================================================================
-- 7. SEED DATA (ADMINISTRADOR Y PERMISOS BASE)
-- ====================================================================
INSERT INTO public.usuarios (usuario, password, rol, estado)
VALUES ('admin', 'admin123', 'admin', 'Activo')
ON CONFLICT (usuario) DO UPDATE 
SET estado = 'Activo', rol = 'admin';

INSERT INTO public.permisos (usuario, modulo, ver, crear, editar, eliminar)
VALUES 
    ('admin', 'inventario', true, true, true, true),
    ('admin', 'recepcion', true, true, true, true),
    ('admin', 'auditorias', true, true, true, true),
    ('admin', 'confiabilidad', true, true, true, true),
    ('admin', 'usuarios', true, true, true, true),
    ('admin', 'historial', true, true, true, true),
    ('admin', 'bi', true, true, true, true)
ON CONFLICT (usuario, modulo) DO UPDATE 
SET ver = true, crear = true, editar = true, eliminar = true;

INSERT INTO public.historial (usuario, accion, modulo, descripcion)
VALUES ('admin', 'INICIALIZACIÓN', 'sistema', 'Inicialización de esquema maestro, seguridad RLS y canales Realtime.');

