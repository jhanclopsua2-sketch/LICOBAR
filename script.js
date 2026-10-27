/* ============================================================
   SISTEMA DE AUTENTICACIÓN + DASHBOARD DARK/ROJO
   ============================================================
   Archivo: js/script.js
   Descripción: Maneja login, registro (con fecha de nacimiento,
                número de documento y validación de complejidad
                de contraseña), recuperación de contraseña con
                EmailJS (correo real), validación estricta,
                persistencia con localStorage/sessionStorage y
                el modal de información de cuenta del dashboard.

   REGLAS DE VALIDACIÓN IMPLEMENTADAS:
   1. Ningún campo puede comenzar con un espacio en blanco.
   2. La contraseña no puede contener: < > ' " / &
   3. La contraseña debe tener al menos:
      - 1 letra mayúscula (A-Z)
      - 1 número (0-9)
      - 1 carácter especial
   4. Persistencia 100% local con localStorage (sin backend propio).
   5. Recuperación de contraseña con EmailJS (correo electrónico REAL).
   6. Fecha de nacimiento obligatoria (no vacía, no futura, edad mínima 13).
   7. Número de documento obligatorio (8-12 caracteres alfanuméricos).
   ============================================================ */

/* ============================================================
   CONFIGURACIÓN DE EMAILJS - TUS CREDENCIALES REALES
   ============================================================ */
const EMAILJS_CONFIG = {
    PUBLIC_KEY: 'q4RQrB2P74NFN8wKq',
    SERVICE_ID: 'service_gmail',
    TEMPLATE_ID: 'template_verification'
};

/* ============================================================
   CONFIGURACIÓN DE CARACTERES PROHIBIDOS
   ============================================================ */
const CARACTERES_PROHIBIDOS = ['<', '>', "'", '"', '/', '&'];

/* ============================================================
   EXPRESIONES REGULARES PARA VALIDACIÓN DE COMPLEJIDAD
   ============================================================
   Requisitos mínimos de seguridad:
   - Al menos 1 letra mayúscula (A-Z)
   - Al menos 1 número (0-9)
   - Al menos 1 carácter especial (excluyendo los prohibidos)
   ============================================================ */

// [A-Z] → Coincide con cualquier letra mayúscula de la A a la Z
const REGEX_MAYUSCULA = /[A-Z]/;

// [a-z] → Coincide con cualquier letra minúscula (recomendado para fortaleza)
const REGEX_MINUSCULA = /[a-z]/;

// [0-9] → Coincide con cualquier dígito del 0 al 9
const REGEX_NUMERO = /[0-9]/;

// Lista de caracteres especiales permitidos (excluye los prohibidos < > ' " / &)
// Se escaparon: \- \[ \] \\ para que sean literales dentro de la clase [...]
const REGEX_ESPECIAL = /[!@#$%^*()_+\-=\[\]{}|\\:,.;?~]/;

/* Tiempo de expiración del código de recuperación (10 minutos) */
const TIEMPO_EXPIRACION_CODIGO = 10 * 60 * 1000;

/* Edad mínima para registrarse (13 años) */
const EDAD_MINIMA_REGISTRO = 13;

/* Variable global para el intervalo del countdown */
let countdownInterval = null;

/* ============================================================
   INICIALIZACIÓN AL CARGAR EL DOM
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
    inicializarUsuariosPorDefecto();

    if (document.getElementById('login-form')) {
        // Inicializar EmailJS con el PUBLIC Key
        if (typeof emailjs !== 'undefined') {
            emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
            console.log('✅ EmailJS inicializado correctamente');
            console.log('   - Public Key:', EMAILJS_CONFIG.PUBLIC_KEY);
            console.log('   - Service ID:', EMAILJS_CONFIG.SERVICE_ID);
            console.log('   - Template ID:', EMAILJS_CONFIG.TEMPLATE_ID);
        } else {
            console.warn('⚠️ EmailJS SDK no encontrado. Verifica el CDN en index.html');
        }

        const registerPassword = document.getElementById('register-password');
        if (registerPassword) {
            registerPassword.addEventListener('input', evaluarFortalezaPassword);
        }

        const resetPassword = document.getElementById('reset-password');
        if (resetPassword) {
            resetPassword.addEventListener('input', evaluarFortalezaResetPassword);
        }

        // Establecer fecha máxima del campo de nacimiento (hoy)
        const birthdateInput = document.getElementById('register-birthdate');
        if (birthdateInput) {
            const hoy = new Date();
            const yyyy = hoy.getFullYear();
            const mm = String(hoy.getMonth() + 1).padStart(2, '0');
            const dd = String(hoy.getDate()).padStart(2, '0');
            birthdateInput.max = yyyy + '-' + mm + '-' + dd;
        }
    }
});

/* ============================================================
   SECCIÓN 1: CAMBIO DE VISTA ENTRE LOGIN, REGISTRO Y RECUPERACIÓN
   ============================================================ */

function cambiarVista(vista) {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('login-form');
    const formRegister = document.getElementById('register-form');
    const formRecovery = document.getElementById('recovery-form');
    const formReset = document.getElementById('reset-form');
    const formTitle = document.getElementById('form-title');
    const subtitle = document.querySelector('.subtitle');
    const tabsContainer = document.getElementById('tabs-container');

    tabsContainer.classList.remove('hidden');

    if (formRecovery) formRecovery.classList.remove('active');
    if (formReset) formReset.classList.remove('active');

    ocultarMensaje('login-message');
    ocultarMensaje('register-message');
    ocultarMensaje('recovery-message');
    ocultarMensaje('reset-message');

    if (vista === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.add('active');
        formRegister.classList.remove('active');
        formTitle.textContent = 'Iniciar Sesión';
        subtitle.textContent = 'Bienvenido de nuevo, ingresa tus credenciales';
    } else {
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
        formLogin.classList.remove('active');
        formRegister.classList.add('active');
        formTitle.textContent = 'Crear Cuenta';
        subtitle.textContent = 'Completa el formulario para registrarte';
    }
}

/* ============================================================
   SECCIÓN 2: VALIDACIONES ESTRICTAS
   ============================================================ */

/**
 * REGLA #1 (PREVENTIVA con FEEDBACK VISUAL): Bloquea la tecla
 * espacio ANTES de que se escriba en el input, si el cursor está
 * en la posición 0 (inicio del campo).
 */
function prevenirEspacioInicial(event, mensajeId) {
    if (event.key === ' ' || event.code === 'Space' || event.keyCode === 32 || event.which === 32) {
        const input = event.target;
        if (input.selectionStart === 0) {
            event.preventDefault();
            input.classList.add('input-error');
            if (mensajeId) {
                mostrarMensaje(mensajeId, 'error',
                    '⚠ El campo "' + obtenerLabelDelInput(input) +
                    '" no puede comenzar con un espacio en blanco.');
            }
            setTimeout(function() {
                input.classList.remove('input-error');
            }, 3000);
            return false;
        }
    }
    return true;
}

/**
 * REGLA #1 (CORRECTIVA): Elimina espacios al inicio si se colaron.
 */
function validarSinEspacioInicial(input, mensajeId) {
    const valor = input.value;
    if (valor.startsWith(' ')) {
        input.value = valor.replace(/^\s+/, '');
        input.classList.add('input-error');
        mostrarMensaje(mensajeId, 'error',
            '⚠ El campo "' + obtenerLabelDelInput(input) +
            '" no puede comenzar con un espacio en blanco.');
        setTimeout(function() {
            input.classList.remove('input-error');
        }, 3000);
    }
}

/**
 * REGLA #2: Valida que la contraseña no contenga caracteres prohibidos.
 * Caracteres prohibidos: < > ' " / &
 */
function validarCaracteresProhibidos(input, mensajeId) {
    const password = input.value;
    const caracteresEncontrados = [];

    for (let i = 0; i < CARACTERES_PROHIBIDOS.length; i++) {
        const caracter = CARACTERES_PROHIBIDOS[i];
        if (password.includes(caracter)) {
            caracteresEncontrados.push(caracter);
        }
    }

    if (caracteresEncontrados.length > 0) {
        input.classList.add('input-error');
        const listaCaracteres = caracteresEncontrados.join('  ');
        mostrarMensaje(mensajeId, 'error',
            '⚠ La contraseña contiene caracteres prohibidos: ' + listaCaracteres +
            '. Por favor elimínalos.');
        setTimeout(function() {
            input.classList.remove('input-error');
        }, 5000);
        return false;
    }
    return true;
}

/**
 * VALIDACIÓN DE COMPLEJIDAD DE CONTRASEÑA
 * Verifica que la contraseña cumpla con los requisitos mínimos:
 *   - Al menos 1 letra mayúscula
 *   - Al menos 1 número
 *   - Al menos 1 carácter especial
 *
 * Usa operadores lógicos estándar (&&, ||, !) y expresiones regulares.
 *
 * @param {string} password - La contraseña a validar
 * @param {string} mensajeId - ID del contenedor donde mostrar el error
 * @returns {boolean} true si la contraseña cumple todos los criterios, false si no
 */
function validarComplejidadPassword(password, mensajeId) {
    // Array para acumular los criterios no cumplidos
    const criteriosFaltantes = [];

    // CRITERIO 1: Al menos una letra mayúscula
    // Usamos el operador ! (negación) para verificar que NO cumple
    if (!REGEX_MAYUSCULA.test(password)) {
        criteriosFaltantes.push('una letra mayúscula (A-Z)');
    }

    // CRITERIO 2: Al menos un número
    if (!REGEX_NUMERO.test(password)) {
        criteriosFaltantes.push('un número (0-9)');
    }

    // CRITERIO 3: Al menos un carácter especial
    if (!REGEX_ESPECIAL.test(password)) {
        criteriosFaltantes.push('un carácter especial (!@#$%^*()_+-=[]{}|\\:,.;?~)');
    }

    // Si hay criterios faltantes, bloquear el envío
    if (criteriosFaltantes.length > 0) {
        // Construir el mensaje detallado con los criterios faltantes
        const mensajeError = '⚠ La contraseña debe contener al menos: ' +
                             criteriosFaltantes.join(' y ') + '.';

        // Mostrar el mensaje de error en el contenedor correspondiente
        mostrarMensaje(mensajeId, 'error', mensajeError);

        // Retornar false para BLOQUEAR el envío del formulario
        return false;
    }

    // Todos los criterios se cumplen → permitir el envío
    return true;
}

function obtenerLabelDelInput(input) {
    if (input.id) {
        const label = document.querySelector('label[for="' + input.id + '"]');
        if (label) {
            return label.textContent.trim();
        }
    }
    return 'campo';
}

/* ============================================================
   SECCIÓN 3: INICIO DE SESIÓN
   ============================================================ */

function iniciarSesion(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const loginBtn = document.getElementById('login-btn');

    if (!email || !password) {
        mostrarMensaje('login-message', 'error', 'Por favor completa todos los campos.');
        return false;
    }

    if (!validarEmail(email)) {
        mostrarMensaje('login-message', 'error', 'El correo electrónico no es válido.');
        return false;
    }

    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    setTimeout(function() {
        const usuarios = obtenerUsuarios();
        const usuarioEncontrado = usuarios.find(function(u) {
            return u.email === email && u.password === hashPassword(password);
        });

        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;

        if (usuarioEncontrado) {
            const sesion = {
                id: usuarioEncontrado.id,
                nombre: usuarioEncontrado.nombre,
                email: usuarioEncontrado.email,
                loginTime: new Date().toISOString(),
                remember: rememberMe
            };

            if (rememberMe) {
                localStorage.setItem('sesion_activa', JSON.stringify(sesion));
            } else {
                sessionStorage.setItem('sesion_activa', JSON.stringify(sesion));
            }

            mostrarMensaje('login-message', 'success', '¡Inicio de sesión exitoso! Redirigiendo...');

            setTimeout(function() {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            mostrarMensaje('login-message', 'error', 'Credenciales incorrectas. Verifica tu email y contraseña.');
        }
    }, 800);

    return false;
}

/* ============================================================
   SECCIÓN 4: REGISTRO DE NUEVOS USUARIOS
   ============================================================
   Incluye validación de:
   - Nombre completo (mínimo 3 caracteres, sin espacios al inicio)
   - Correo electrónico (formato válido)
   - Fecha de nacimiento (no vacía, no futura, edad mínima 13 años)
   - Número de documento (8-12 caracteres alfanuméricos)
   - Contraseña (mínimo 8 caracteres, sin caracteres prohibidos,
     con al menos 1 mayúscula + 1 número + 1 carácter especial)
   - Confirmación de contraseña (debe coincidir)
   - Aceptación de términos
   ============================================================ */

function registrarUsuario(event) {
    event.preventDefault();

    const nombreRaw = document.getElementById('register-name').value;
    const emailRaw = document.getElementById('register-email').value;
    const birthdate = document.getElementById('register-birthdate').value;
    const documentoRaw = document.getElementById('register-document').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const acceptTerms = document.getElementById('accept-terms').checked;
    const registerBtn = document.getElementById('register-btn');

    // === VALIDACIÓN REGLA #1: SIN ESPACIOS AL INICIO EN TODOS LOS CAMPOS ===
    if (nombreRaw.startsWith(' ') || emailRaw.startsWith(' ') ||
        password.startsWith(' ') || confirm.startsWith(' ') ||
        documentoRaw.startsWith(' ')) {
        mostrarMensaje('register-message', 'error', '⚠ Ningún campo puede comenzar con un espacio en blanco. Corrígelo e inténtalo de nuevo.');
        return false;
    }

    const nombre = nombreRaw.trim();
    const email = emailRaw.trim().toLowerCase();
    const documento = documentoRaw.trim();

    // === VALIDACIONES BÁSICAS ===

    if (nombre.length < 3) {
        mostrarMensaje('register-message', 'error', 'El nombre debe tener al menos 3 caracteres.');
        return false;
    }

    if (!validarEmail(email)) {
        mostrarMensaje('register-message', 'error', 'El correo electrónico no es válido.');
        return false;
    }

    // VALIDAR FECHA DE NACIMIENTO
    if (!birthdate || birthdate.trim() === '') {
        mostrarMensaje('register-message', 'error', '⚠ Debes seleccionar tu fecha de nacimiento.');
        return false;
    }

    const fechaNacimiento = new Date(birthdate + 'T00:00:00');
    if (isNaN(fechaNacimiento.getTime())) {
        mostrarMensaje('register-message', 'error', '⚠ La fecha de nacimiento no es válida.');
        return false;
    }

    const fechaActual = new Date();
    fechaActual.setHours(23, 59, 59, 999);
    if (fechaNacimiento > fechaActual) {
        mostrarMensaje('register-message', 'error', '⚠ La fecha de nacimiento no puede ser futura.');
        return false;
    }

    const edadMinimaFecha = new Date();
    edadMinimaFecha.setFullYear(edadMinimaFecha.getFullYear() - EDAD_MINIMA_REGISTRO);
    if (fechaNacimiento > edadMinimaFecha) {
        mostrarMensaje('register-message', 'error', '⚠ Debes tener al menos ' + EDAD_MINIMA_REGISTRO + ' años para registrarte.');
        return false;
    }

    // VALIDAR NÚMERO DE DOCUMENTO
    if (!documento || documento.trim() === '') {
        mostrarMensaje('register-message', 'error', '⚠ Debes ingresar tu número de documento.');
        return false;
    }

    if (documento.length < 8 || documento.length > 12) {
        mostrarMensaje('register-message', 'error', '⚠ El número de documento debe tener entre 8 y 12 caracteres. Actualmente tiene ' + documento.length + '.');
        return false;
    }

    if (!/^[A-Za-z0-9]+$/.test(documento)) {
        mostrarMensaje('register-message', 'error', '⚠ El número de documento solo puede contener letras y números (sin espacios ni símbolos).');
        return false;
    }

    // Validar longitud mínima de contraseña (8 caracteres)
    if (password.length < 8) {
        mostrarMensaje('register-message', 'error', 'La contraseña debe tener al menos 8 caracteres.');
        return false;
    }

    // === VALIDACIÓN REGLA #2: CARACTERES PROHIBIDOS EN CONTRASEÑA ===
    const caracteresEncontrados = [];
    for (let i = 0; i < CARACTERES_PROHIBIDOS.length; i++) {
        if (password.includes(CARACTERES_PROHIBIDOS[i])) {
            caracteresEncontrados.push(CARACTERES_PROHIBIDOS[i]);
        }
    }

    if (caracteresEncontrados.length > 0) {
        const lista = caracteresEncontrados.join('  ');
        mostrarMensaje('register-message', 'error', '⚠ La contraseña contiene caracteres prohibidos (' + lista + '). Por favor elimínalos e inténtalo de nuevo.');
        return false;
    }

    // VALIDACIÓN DE COMPLEJIDAD: mayúscula + número + carácter especial
    // Esta validación bloquea el registro si la contraseña no cumple los requisitos mínimos
    if (!validarComplejidadPassword(password, 'register-message')) {
        // La función ya mostró el mensaje de error detallado
        // Retornamos false para impedir el envío del formulario
        return false;
    }

    // Validar que las contraseñas coincidan
    if (password !== confirm) {
        mostrarMensaje('register-message', 'error', 'Las contraseñas no coinciden.');
        return false;
    }

    // Validar aceptación de términos
    if (!acceptTerms) {
        mostrarMensaje('register-message', 'error', 'Debes aceptar los términos y condiciones.');
        return false;
    }

    // Mostrar estado de carga
    registerBtn.classList.add('loading');
    registerBtn.disabled = true;

    // Simular retardo de registro (efecto visual)
    setTimeout(function() {
        const usuarios = obtenerUsuarios();

        // Verificar si el email ya está registrado (evitar duplicados)
        const emailExiste = usuarios.some(function(u) {
            return u.email === email;
        });

        if (emailExiste) {
            registerBtn.classList.remove('loading');
            registerBtn.disabled = false;
            mostrarMensaje('register-message', 'error', 'Este correo ya está registrado. Intenta iniciar sesión.');
            return;
        }

        // Verificar si el número de documento ya está registrado
        const documentoExiste = usuarios.some(function(u) {
            return u.numeroDocumento === documento;
        });

        if (documentoExiste) {
            registerBtn.classList.remove('loading');
            registerBtn.disabled = false;
            mostrarMensaje('register-message', 'error', '⚠ El número de documento "' + documento + '" ya está registrado. Si crees que es un error, contacta al administrador.');
            return;
        }

        // Crear el nuevo usuario con TODOS los campos
        const nuevoUsuario = {
            id: generarId(),
            nombre: nombre,
            email: email,
            fechaNacimiento: birthdate,
            numeroDocumento: documento,
            password: hashPassword(password),
            fechaRegistro: new Date().toISOString(),
            avatar: nombre.charAt(0).toUpperCase()
        };

        // Agregar el nuevo usuario al array y guardar en localStorage
        usuarios.push(nuevoUsuario);
        guardarUsuarios(usuarios);

        // Quitar el estado de carga
        registerBtn.classList.remove('loading');
        registerBtn.disabled = false;

        // Mostrar mensaje de éxito
        mostrarMensaje('register-message', 'success', '¡Cuenta creada exitosamente! Redirigiendo al login...');

        // Limpiar el formulario tras el registro exitoso
        document.getElementById('register-form').reset();

        // Cambiar a la vista de login después de 2 segundos
        setTimeout(function() {
            cambiarVista('login');
            document.getElementById('login-email').value = email;
        }, 2000);
    }, 800);

    return false;
}

/* ============================================================
   SECCIÓN 5: GESTIÓN DE USUARIOS CON LOCALSTORAGE
   ============================================================ */

function obtenerUsuarios() {
    const usuariosJSON = localStorage.getItem('usuarios_registrados');
    if (usuariosJSON) {
        try {
            return JSON.parse(usuariosJSON);
        } catch (e) {
            console.error('Error al parsear usuarios:', e);
            return [];
        }
    }
    return [];
}

function guardarUsuarios(usuarios) {
    localStorage.setItem('usuarios_registrados', JSON.stringify(usuarios));
}

function inicializarUsuariosPorDefecto() {
    const usuarios = obtenerUsuarios();

    if (usuarios.length === 0) {
        fetch('data/usuarios.json')
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('No se pudo cargar el archivo de usuarios');
                }
                return response.json();
            })
            .then(function(usuariosBase) {
                usuariosBase.forEach(function(u) {
                    u.password = hashPassword(u.password);
                });
                guardarUsuarios(usuariosBase);
                console.log('Usuarios por defecto inicializados:', usuariosBase.length);
            })
            .catch(function(error) {
                console.warn('No se pudieron cargar usuarios por defecto:', error);
                const adminUser = {
                    id: generarId(),
                    nombre: 'Administrador',
                    email: 'admin@demo.com',
                    fechaNacimiento: '1990-01-01',
                    numeroDocumento: '12345678',
                    password: hashPassword('admin123'),
                    fechaRegistro: new Date().toISOString(),
                    avatar: 'A'
                };
                guardarUsuarios([adminUser]);
                console.log('Usuario admin creado: admin@demo.com / admin123');
            });
    }
}

/* ============================================================
   SECCIÓN 6: GESTIÓN DE SESIÓN Y PROTECCIÓN DE RUTAS
   ============================================================ */

function obtenerSesionActiva() {
    let sesionJSON = localStorage.getItem('sesion_activa');
    if (!sesionJSON) {
        sesionJSON = sessionStorage.getItem('sesion_activa');
    }
    if (sesionJSON) {
        try {
            return JSON.parse(sesionJSON);
        } catch (e) {
            return null;
        }
    }
    return null;
}

function inicializarDashboard() {
    const sesion = obtenerSesionActiva();

    if (!sesion) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('user-name').textContent = sesion.nombre;
    document.getElementById('user-avatar').textContent = sesion.nombre.charAt(0).toUpperCase();
    document.getElementById('welcome-name').textContent = sesion.nombre;

    const loginDate = new Date(sesion.loginTime);
    const formattedTime = loginDate.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('session-time').textContent = formattedTime;

    document.getElementById('modal-avatar').textContent = sesion.nombre.charAt(0).toUpperCase();
    document.getElementById('modal-nombre').textContent = sesion.nombre;
    document.getElementById('modal-email').textContent = sesion.email;
    document.getElementById('modal-full-name').textContent = sesion.nombre;
    document.getElementById('modal-full-email').textContent = sesion.email;
    document.getElementById('modal-user-id').textContent = sesion.id;
    document.getElementById('modal-session-start').textContent = formattedTime;
    document.getElementById('modal-session-type').textContent = sesion.remember ? 'Persistente (Recordarme)' : 'Temporal (esta pestaña)';

    actualizarTiempoSesion(sesion.loginTime);
    setInterval(function() {
        actualizarTiempoSesion(sesion.loginTime);
    }, 60000);
}

function cerrarSesion() {
    if (confirm('¿Estás seguro que deseas cerrar la sesión?')) {
        localStorage.removeItem('sesion_activa');
        sessionStorage.removeItem('sesion_activa');
        window.location.href = 'index.html';
    }
}

/* ============================================================
   SECCIÓN 7: MODAL DE INFORMACIÓN DE CUENTA
   ============================================================ */

function abrirModalUsuario() {
    const modal = document.getElementById('modal-usuario');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function cerrarModalUsuario() {
    const modal = document.getElementById('modal-usuario');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function cerrarModalSiClicFuera(event) {
    if (event.target.id === 'modal-usuario') {
        cerrarModalUsuario();
    }
}

function cerrarModalConESC(event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
        cerrarModalUsuario();
    }
}

function actualizarTiempoSesion(loginTimeISO) {
    const elemento = document.getElementById('modal-session-duration');
    if (!elemento) return;

    const inicio = new Date(loginTimeISO).getTime();
    const ahora = Date.now();
    const diferencia = ahora - inicio;

    const horas = Math.floor(diferencia / 3600000);
    const minutos = Math.floor((diferencia % 3600000) / 60000);
    const segundos = Math.floor((diferencia % 60000) / 1000);

    if (horas > 0) {
        elemento.textContent = horas + 'h ' + minutos + 'm';
    } else if (minutos > 0) {
        elemento.textContent = minutos + 'm ' + segundos + 's';
    } else {
        elemento.textContent = segundos + 's';
    }
}

/* ============================================================
   SECCIÓN 8: UTILIDADES Y VALIDACIONES AUXILIARES
   ============================================================ */

function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function generarId() {
    return 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return btoa(password) + '_' + hash;
}

function mostrarMensaje(elementId, tipo, texto) {
    const elemento = document.getElementById(elementId);
    if (elemento) {
        elemento.textContent = texto;
        elemento.className = 'message show ' + tipo;
        setTimeout(function() {
            ocultarMensaje(elementId);
        }, 5000);
    }
}

function ocultarMensaje(elementId) {
    const elemento = document.getElementById(elementId);
    if (elemento) {
        elemento.className = 'message';
    }
}

function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        button.style.color = 'var(--red-accent)';
    } else {
        input.type = 'password';
        button.style.color = 'var(--text-muted-dark)';
    }
}

function evaluarFortalezaPassword() {
    const password = document.getElementById('register-password').value;
    const formGroup = document.getElementById('register-password').closest('.form-group');
    if (!formGroup) return;
    const strengthBar = formGroup.querySelector('.strength-bar');
    const strengthText = formGroup.querySelector('.strength-text');
    if (!strengthBar || !strengthText) return;
    evaluarFortalezaEnElementos(password, strengthBar, strengthText);
}

function evaluarFortalezaResetPassword() {
    const password = document.getElementById('reset-password').value;
    const formGroup = document.getElementById('reset-password').closest('.form-group');
    if (!formGroup) return;
    const strengthBar = formGroup.querySelector('.strength-bar');
    const strengthText = formGroup.querySelector('.strength-text');
    if (!strengthBar || !strengthText) return;
    evaluarFortalezaEnElementos(password, strengthBar, strengthText);
}

function evaluarFortalezaEnElementos(password, strengthBar, strengthText) {
    if (password.length === 0) {
        strengthBar.className = 'strength-bar';
        strengthText.textContent = '';
        return;
    }

    let puntaje = 0;
    if (password.length >= 8)   puntaje++;
    if (/[a-z]/.test(password)) puntaje++;
    if (/[A-Z]/.test(password)) puntaje++;
    if (/[0-9]/.test(password)) puntaje++;
    if (/[^A-Za-z0-9]/.test(password)) puntaje++;

    if (puntaje <= 2) {
        strengthBar.className = 'strength-bar strength-weak';
        strengthText.textContent = 'Débil';
        strengthText.style.color = 'var(--color-error)';
    } else if (puntaje <= 4) {
        strengthBar.className = 'strength-bar strength-medium';
        strengthText.textContent = 'Media';
        strengthText.style.color = 'var(--color-warning)';
    } else {
        strengthBar.className = 'strength-bar strength-strong';
        strengthText.textContent = 'Fuerte';
        strengthText.style.color = 'var(--color-success)';
    }
}

/* ============================================================
   SECCIÓN 9: RECUPERACIÓN DE CONTRASEÑA CON EMAILJS (CORREO REAL)
   ============================================================ */

function mostrarVistaRecuperacion() {
    document.getElementById('tabs-container').classList.add('hidden');
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('reset-form').classList.remove('active');
    document.getElementById('recovery-form').classList.add('active');
    document.getElementById('form-title').textContent = 'Recuperar Cuenta';
    document.querySelector('.subtitle').textContent = 'Ingresa tu correo para recibir un código de verificación';
    ocultarMensaje('login-message');
    ocultarMensaje('recovery-message');
    setTimeout(function() {
        document.getElementById('recovery-email').focus();
    }, 100);
}

function mostrarVistaReset() {
    document.getElementById('tabs-container').classList.add('hidden');
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('register-form').classList.remove('active');
    document.getElementById('recovery-form').classList.remove('active');
    document.getElementById('reset-form').classList.add('active');
    document.getElementById('form-title').textContent = 'Verificar Código';
    document.querySelector('.subtitle').textContent = 'Ingresa el código que recibiste por correo y tu nueva contraseña';
    setTimeout(function() {
        document.getElementById('reset-code').focus();
    }, 100);
}

function volverALogin() {
    detenerCountdown();
    sessionStorage.removeItem('codigo_recuperacion');
    document.getElementById('recovery-email').value = '';
    document.getElementById('reset-code').value = '';
    document.getElementById('reset-password').value = '';
    document.getElementById('reset-confirm').value = '';
    document.getElementById('reset-email-display').textContent = '--';

    const resetFormGroup = document.getElementById('reset-password').closest('.form-group');
    if (resetFormGroup) {
        const resetStrengthBar = resetFormGroup.querySelector('.strength-bar');
        const resetStrengthText = resetFormGroup.querySelector('.strength-text');
        if (resetStrengthBar) resetStrengthBar.className = 'strength-bar';
        if (resetStrengthText) resetStrengthText.textContent = '';
    }

    cambiarVista('login');
}

function generarCodigoVerificacion() {
    let codigo = '';
    for (let i = 0; i < 6; i++) {
        codigo += Math.floor(Math.random() * 10).toString();
    }
    return codigo;
}

/**
 * Envía el código de verificación por correo REAL usando EmailJS.
 */
function enviarCodigoRecuperacion(event) {
    event.preventDefault();

    const email = document.getElementById('recovery-email').value.trim().toLowerCase();
    const recoveryBtn = document.getElementById('recovery-btn');

    if (!validarEmail(email)) {
        mostrarMensaje('recovery-message', 'error', 'El correo electrónico no es válido.');
        return false;
    }

    const usuarios = obtenerUsuarios();
    const usuario = usuarios.find(function(u) {
        return u.email === email;
    });

    if (!usuario) {
        mostrarMensaje('recovery-message', 'error', 'No se encontró ninguna cuenta con este correo electrónico.');
        return false;
    }

    recoveryBtn.classList.add('loading');
    recoveryBtn.disabled = true;

    const codigo = generarCodigoVerificacion();
    const expiracion = Date.now() + TIEMPO_EXPIRACION_CODIGO;

    const datosRecuperacion = {
        codigo: codigo,
        email: email,
        nombre: usuario.nombre,
        expiracion: expiracion
    };
    sessionStorage.setItem('codigo_recuperacion', JSON.stringify(datosRecuperacion));

    const templateParams = {
        to_email: email,
        to_name: usuario.nombre,
        verification_code: codigo,
        subject: 'Código de Recuperación de Contraseña - LICOBAR UI'
    };

    emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, templateParams)
        .then(function(response) {
            console.log('✅ Correo enviado correctamente:', response.status, response.text);

            recoveryBtn.classList.remove('loading');
            recoveryBtn.disabled = false;

            document.getElementById('reset-email-display').textContent = email;

            mostrarVistaReset();
            iniciarCountdown(expiracion);

            mostrarMensaje('reset-message', 'success', '✓ Te hemos enviado un código de 6 dígitos por correo. Revisa tu bandeja de entrada.');
        })
        .catch(function(error) {
            console.error('❌ Error al enviar el correo:', error);

            recoveryBtn.classList.remove('loading');
            recoveryBtn.disabled = false;

            mostrarMensaje('recovery-message', 'error', '❌ Error al enviar el correo. Revisa la consola (F12) para más detalles.');
        });

    return false;
}

/**
 * Reenvía el código de verificación por correo.
 */
function reenviarCodigo() {
    const datosGuardados = sessionStorage.getItem('codigo_recuperacion');
    if (!datosGuardados) {
        mostrarMensaje('reset-message', 'error', 'No hay una solicitud de recuperación activa. Vuelve al inicio.');
        return;
    }

    const datos = JSON.parse(datosGuardados);
    const nuevoCodigo = generarCodigoVerificacion();
    const nuevaExpiracion = Date.now() + TIEMPO_EXPIRACION_CODIGO;

    datos.codigo = nuevoCodigo;
    datos.expiracion = nuevaExpiracion;
    sessionStorage.setItem('codigo_recuperacion', JSON.stringify(datos));

    const templateParams = {
        to_email: datos.email,
        to_name: datos.nombre,
        verification_code: nuevoCodigo,
        subject: 'Nuevo Código de Recuperación - LICOBAR UI'
    };

    mostrarMensaje('reset-message', 'success', 'Reenviando código...');

    emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, templateParams)
        .then(function(response) {
            console.log('✅ Código reenviado:', response.status);
            detenerCountdown();
            iniciarCountdown(nuevaExpiracion);
            mostrarMensaje('reset-message', 'success', '✓ ¡Nuevo código enviado! Revisa tu correo.');
        })
        .catch(function(error) {
            console.error('❌ Error al reenviar:', error);
            mostrarMensaje('reset-message', 'error', '❌ Error al reenviar el código. Intenta nuevamente.');
        });
}

function iniciarCountdown(timestampExpiracion) {
    detenerCountdown();
    const timerElement = document.getElementById('countdown-timer');
    if (!timerElement) return;

    const expirado = actualizarCountdown(timestampExpiracion, timerElement);

    if (!expirado) {
        countdownInterval = setInterval(function() {
            const expiradoAhora = actualizarCountdown(timestampExpiracion, timerElement);
            if (expiradoAhora) {
                detenerCountdown();
                mostrarMensaje('reset-message', 'error', '⏱ El código ha expirado. Genera uno nuevo para continuar.');
            }
        }, 1000);
    }
}

function actualizarCountdown(timestampExpiracion, timerElement) {
    const ahora = Date.now();
    const tiempoRestante = timestampExpiracion - ahora;

    if (tiempoRestante <= 0) {
        timerElement.textContent = '00:00';
        timerElement.style.color = 'var(--color-error)';
        return true;
    }

    const minutos = Math.floor(tiempoRestante / 60000);
    const segundos = Math.floor((tiempoRestante % 60000) / 1000);
    const minutosFormateados = minutos.toString().padStart(2, '0');
    const segundosFormateados = segundos.toString().padStart(2, '0');

    timerElement.textContent = minutosFormateados + ':' + segundosFormateados;

    if (tiempoRestante < 120000) {
        timerElement.style.color = 'var(--color-error)';
    } else {
        timerElement.style.color = 'var(--color-warning)';
    }

    return false;
}

function detenerCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

/**
 * Verifica el código ingresado y actualiza la contraseña del usuario.
 */
function verificarCodigoYRestablecer(event) {
    event.preventDefault();

    const codigoIngresado = document.getElementById('reset-code').value.trim();
    const nuevaPassword = document.getElementById('reset-password').value;
    const confirmarPassword = document.getElementById('reset-confirm').value;
    const resetBtn = document.getElementById('reset-btn');

    const datosGuardados = sessionStorage.getItem('codigo_recuperacion');
    if (!datosGuardados) {
        mostrarMensaje('reset-message', 'error', 'No hay una solicitud de recuperación activa. Vuelve al inicio.');
        return false;
    }

    const datos = JSON.parse(datosGuardados);

    if (Date.now() > datos.expiracion) {
        mostrarMensaje('reset-message', 'error', '⏱ El código ha expirado. Solicita uno nuevo.');
        detenerCountdown();
        return false;
    }

    if (codigoIngresado !== datos.codigo) {
        mostrarMensaje('reset-message', 'error', 'El código ingresado es incorrecto. Verifica tu correo e inténtalo de nuevo.');
        return false;
    }

    if (nuevaPassword.length < 8) {
        mostrarMensaje('reset-message', 'error', 'La contraseña debe tener al menos 8 caracteres.');
        return false;
    }

    // REGLA #1: Sin espacios al inicio
    if (nuevaPassword.startsWith(' ') || confirmarPassword.startsWith(' ')) {
        mostrarMensaje('reset-message', 'error', '⚠ Ningún campo puede comenzar con un espacio en blanco.');
        return false;
    }

    // REGLA #2: Caracteres prohibidos
    const caracteresEncontrados = [];
    for (let i = 0; i < CARACTERES_PROHIBIDOS.length; i++) {
        if (nuevaPassword.includes(CARACTERES_PROHIBIDOS[i])) {
            caracteresEncontrados.push(CARACTERES_PROHIBIDOS[i]);
        }
    }

    if (caracteresEncontrados.length > 0) {
        const lista = caracteresEncontrados.join('  ');
        mostrarMensaje('reset-message', 'error', '⚠ La contraseña contiene caracteres prohibidos (' + lista + '). Por favor elimínalos.');
        return false;
    }

    // VALIDACIÓN DE COMPLEJIDAD para la nueva contraseña
    if (!validarComplejidadPassword(nuevaPassword, 'reset-message')) {
        return false;
    }

    if (nuevaPassword !== confirmarPassword) {
        mostrarMensaje('reset-message', 'error', 'Las contraseñas no coinciden.');
        return false;
    }

    resetBtn.classList.add('loading');
    resetBtn.disabled = true;

    setTimeout(function() {
        const usuarios = obtenerUsuarios();
        const indiceUsuario = usuarios.findIndex(function(u) {
            return u.email === datos.email;
        });

        if (indiceUsuario === -1) {
            resetBtn.classList.remove('loading');
            resetBtn.disabled = false;
            mostrarMensaje('reset-message', 'error', 'No se encontró el usuario. Contacta al administrador.');
            return;
        }

        usuarios[indiceUsuario].password = hashPassword(nuevaPassword);
        guardarUsuarios(usuarios);

        sessionStorage.removeItem('codigo_recuperacion');
        detenerCountdown();

        resetBtn.classList.remove('loading');
        resetBtn.disabled = false;

        document.getElementById('reset-code').value = '';
        document.getElementById('reset-password').value = '';
        document.getElementById('reset-confirm').value = '';

        mostrarMensaje('reset-message', 'success', '✓ ¡Contraseña actualizada correctamente! Redirigiendo...');

        setTimeout(function() {
            volverALogin();
            mostrarMensaje('login-message', 'success', '✓ ¡Contraseña actualizada correctamente! Ya puedes iniciar sesión.');
        }, 2000);
    }, 800);

    return false;
}