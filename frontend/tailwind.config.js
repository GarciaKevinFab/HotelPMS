/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		/* Sombras tenidas al matiz 156 y con desplazamiento: sustituyen a las
  		   grises de serie en TODAS las utilidades shadow-*, asi que ninguna
  		   tarjeta puede quedarse con la sombra sucia por olvido. */
  		boxShadow: {
  			sm: 'var(--sombra-1)',
  			DEFAULT: 'var(--sombra-1)',
  			md: 'var(--sombra-2)',
  			lg: 'var(--sombra-3)',
  			xl: 'var(--sombra-3)',
  		},
  		transitionTimingFunction: {
  			out: 'var(--ease-out)',
  		},
  		transitionDuration: {
  			120: '120ms',
  			180: '180ms',
  			240: '240ms',
  		},
  		fontFamily: {
  			heading: ['Manrope', 'Inter', 'sans-serif'],
  			/* Las mismas dos de la landing. Existian solo alli, asi que el
  			   titular del login caia en la familia global (Manrope) y salia con
  			   otra letra y otro cuerpo que el del alta: 33.6 px de Manrope
  			   frente a 54.4 px de Bricolage. */
  			display: ['"Bricolage Grotesque"', '"Trebuchet MS"', 'sans-serif'],
  			cuerpo: ['Karla', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
  		},
  		colors: {
  			/* La paleta de la marca, la MISMA que usa la landing
  			   (backend/landing/estilo.css). Los cuatro colores salen de contar
  			   pixeles del logotipo registrado; los tonos de superficie llevan
  			   matiz verde para emparentar con el oliva de las barras.

  			   Existe porque la pantalla de entrada se pintaba con `slate`, que
  			   es gris AZULADO, y en la identidad de ZenStay no hay azul por
  			   ningun lado. El resultado era que el login no se parecia al sitio
  			   del que venia el usuario. */
  			zen: {
  				/* Escala neutra de la marca. Sustituye a `slate`, que es gris
  				   AZULADO y no pinta nada en una identidad sin azul.

  				   Cada peldano tiene EXACTAMENTE la misma luminancia relativa
  				   que el slate al que reemplaza -calculado, no a ojo-, asi que
  				   ningun contraste de la interfaz empeora al cambiarla: solo
  				   gira el matiz de azul a verde. */
  				50:  '#f7fbf9',
  				100: '#eff6f3',
  				200: '#daebe5',
  				300: '#bedacf',
  				400: '#7eab9a',
  				500: '#567a6c',
  				600: '#3c5a4e',
  				700: '#29463b',
  				800: '#182d25',
  				900: '#0e1a15',
  				950: '#040806',

  				fondo:      '#0c1210',
  				superficie: '#141d19',
  				alta:       '#1b2621',
  				borde:      '#26332d',
  				texto:      '#e9f0ec',
  				suave:      '#93a89c',
  				fucsia:     '#fc3c78',
  				turquesa:   '#00c0a8',
  				lima:       '#cccc54',
  				oliva:      '#90a854',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};