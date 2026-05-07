import { alpha, createTheme } from '@mui/material/styles';
import { heIL } from '@mui/material/locale';

declare module '@mui/material/styles' {
  interface Components<Theme = unknown> {
    MuiDataGrid?: {
      styleOverrides?: {
        root?: React.CSSProperties | Record<string, unknown>;
        columnHeader?: React.CSSProperties | Record<string, unknown>;
        cell?: React.CSSProperties | Record<string, unknown>;
      };
    };
  }
}

const RTL_DIRECTION = 'rtl';

// Calm enterprise blue palette — primary `#2563eb` (Tailwind blue-600).
const ink = '#1b2422';
const muted = '#61706a';
const paper = '#fbfcf8';
const paperStrong = '#ffffff';
const canvas = '#f3f0ee';
const border = 'rgba(27, 36, 34, 0.1)';
// Names kept for backwards compatibility throughout the file; values are now blue.
const brandRed = '#2563eb';
const brandRedDark = '#1e40af';
const brandRedLight = '#60a5fa';
const errorRed = '#dc2626';
const errorRedDark = '#991b1b';
const errorRedLight = '#f87171';
const charcoal = '#242121';
const blue = '#4f5864';
const green = '#2f7d4f';
const gold = '#c77912';

const hebrewTypography = {
  fontFamily: [
    'Assistant',
    'Rubik',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'sans-serif',
  ].join(','),

  h1: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '2.6rem', fontWeight: 700, letterSpacing: 0 },
  h2: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '2.2rem', fontWeight: 700, letterSpacing: 0 },
  h3: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.9rem', fontWeight: 600, letterSpacing: 0 },
  h4: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.6rem', fontWeight: 600, letterSpacing: 0 },
  h5: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.35rem', fontWeight: 600, letterSpacing: 0 },
  h6: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.18rem', fontWeight: 600, letterSpacing: 0 },
  subtitle1: { fontSize: '1.05rem', fontWeight: 500, letterSpacing: 0, lineHeight: 1.4 },
  subtitle2: { fontSize: '0.98rem', fontWeight: 500, letterSpacing: 0, lineHeight: 1.4 },
  body1: { fontSize: '1.05rem', lineHeight: 1.6, letterSpacing: 0 },
  body2: { fontSize: '0.98rem', lineHeight: 1.55, letterSpacing: 0 },
  caption: { fontSize: '0.88rem', lineHeight: 1.5, letterSpacing: 0 },
  overline: { fontSize: '0.82rem', fontWeight: 600, letterSpacing: 0 },
  button: { fontSize: '1rem', textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
};

export const theme = createTheme(
  {
    direction: RTL_DIRECTION,
    typography: hebrewTypography,

    palette: {
      mode: 'light',
      primary: {
        main: brandRed,
        light: brandRedLight,
        dark: brandRedDark,
        contrastText: '#ffffff',
      },
      secondary: {
        main: charcoal,
        light: '#4d4848',
        dark: '#151313',
        contrastText: '#ffffff',
      },
      success: {
        main: green,
        light: '#66a879',
        dark: '#1e5e38',
      },
      warning: {
        main: gold,
        light: '#e2a442',
        dark: '#8f5509',
      },
      error: {
        main: errorRed,
        light: errorRedLight,
        dark: errorRedDark,
      },
      info: {
        main: blue,
        light: '#6ea3cc',
        dark: '#234f77',
      },
      background: {
        default: canvas,
        paper,
      },
      text: {
        primary: ink,
        secondary: muted,
      },
      divider: border,
    },

    shape: {
      borderRadius: 8,
    },

    shadows: [
      'none',
      '0 1px 2px rgba(27, 36, 34, 0.04)',
      ...Array(23).fill('0 1px 2px rgba(27, 36, 34, 0.04), 0 8px 22px rgba(27, 36, 34, 0.05)'),
    ] as never,

    mixins: {
      toolbar: {
        minHeight: 68,
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            minHeight: '100%',
            backgroundColor: canvas,
            direction: 'ltr',
            overflowX: 'hidden',
          },
          body: {
            minHeight: '100%',
            width: '100%',
            color: ink,
            backgroundColor: canvas,
            direction: 'ltr',
            overflowX: 'hidden',
            scrollbarColor: '#b8aaa8 #f3f0ee',
          },
          '*': {
            scrollbarWidth: 'thin',
          },
        },
      },

      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              outline: `3px solid ${alpha(brandRed, 0.22)}`,
              outlineOffset: 2,
            },
          },
        },
      },

      MuiButton: {
        defaultProps: {
          variant: 'contained',
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 38,
            paddingInline: 16,
            boxShadow: 'none',
            whiteSpace: 'nowrap',
            transition: 'background-color 160ms ease, border-color 160ms ease, opacity 160ms ease',
            '&.Mui-disabled': {
              boxShadow: 'none',
              opacity: 0.62,
              cursor: 'not-allowed',
            },
            '& .MuiButton-startIcon': {
              marginRight: 0,
              marginLeft: 7,
            },
            '& .MuiButton-endIcon': {
              marginLeft: 0,
              marginRight: 7,
            },
          },
          contained: {
            '&.Mui-disabled': {
              color: '#ffffff',
              backgroundImage: 'none',
              backgroundColor: alpha(ink, 0.28),
            },
          },
          containedPrimary: {
            color: '#ffffff',
            backgroundImage: 'none',
            backgroundColor: brandRed,
            '&:hover': {
              backgroundColor: brandRedDark,
            },
          },
          containedSecondary: {
            color: '#ffffff',
            backgroundImage: 'none',
            backgroundColor: charcoal,
            '&:hover': {
              backgroundColor: '#3b3535',
            },
          },
          outlined: {
            borderColor: alpha(ink, 0.16),
            backgroundColor: 'transparent',
            color: ink,
            '&:hover': {
              borderColor: alpha(brandRed, 0.38),
              backgroundColor: alpha(brandRed, 0.04),
            },
          },
          text: {
            color: brandRedDark,
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${border}`,
            backgroundImage: 'none',
            backgroundColor: paper,
            boxShadow: '0 1px 2px rgba(27, 36, 34, 0.04)',
          },
          outlined: {
            borderColor: alpha(ink, 0.1),
            boxShadow: 'none',
            backgroundImage: 'none',
            backgroundColor: paper,
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${border}`,
            backgroundImage: 'none',
            backgroundColor: paper,
            boxShadow: '0 1px 2px rgba(27, 36, 34, 0.04)',
            overflow: 'hidden',
          },
        },
      },

      MuiCardActionArea: {
        styleOverrides: {
          root: {
            '&:hover .MuiCardActionArea-focusHighlight': {
              opacity: 0.04,
            },
          },
        },
      },

      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          fullWidth: true,
        },
      },

      MuiFormLabel: {
        styleOverrides: {
          root: {
            textAlign: 'right',
            transformOrigin: 'top right',
            fontWeight: 600,
            color: muted,
          },
        },
      },

      MuiInputBase: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: alpha(paperStrong, 0.78),
            transition: 'background-color 160ms ease, box-shadow 160ms ease',
            '&.Mui-focused': {
              backgroundColor: paperStrong,
              boxShadow: `0 0 0 3px ${alpha(brandRed, 0.11)}`,
            },
          },
          input: {
            textAlign: 'right',
          },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: {
            borderColor: alpha(ink, 0.14),
          },
          root: {
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(brandRed, 0.38),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: brandRed,
            },
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 7,
            fontWeight: 600,
            maxWidth: '100%',
          },
          label: {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
          outlined: {
            backgroundColor: 'transparent',
            borderColor: alpha(ink, 0.13),
          },
          icon: {
            marginRight: -2,
            marginLeft: 5,
          },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            color: ink,
            transition: 'background-color 160ms ease, color 160ms ease',
            '&:hover': {
              backgroundColor: alpha(brandRed, 0.06),
              color: brandRedDark,
            },
          },
          sizeSmall: {
            width: 34,
            height: 34,
          },
        },
      },

      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${alpha(ink, 0.1)}`,
            alignItems: 'center',
          },
          icon: {
            marginRight: 0,
            marginLeft: 10,
          },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            overflow: 'hidden',
          },
        },
      },

      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontFamily: 'Rubik, Assistant, sans-serif',
            fontWeight: 700,
            borderBottom: `1px solid ${alpha(ink, 0.08)}`,
          },
        },
      },

      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 42,
          },
          indicator: {
            height: 3,
            borderRadius: 999,
          },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 42,
            fontWeight: 600,
            borderRadius: 8,
          },
        },
      },

      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            overflow: 'hidden',
          },
        },
      },

      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(brandRed, 0.05),
            '& .MuiTableCell-root': {
              fontWeight: 600,
              color: ink,
            },
          },
        },
      },

      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 130ms ease',
            '&:hover': {
              backgroundColor: `${alpha(brandRed, 0.045)} !important`,
            },
          },
        },
      },

      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: 0,
            backgroundColor: 'transparent',
            direction: 'rtl',
            color: ink,
            fontVariantNumeric: 'tabular-nums',
            '--DataGrid-rowBorderColor': alpha(ink, 0.07),
            '& .MuiDataGrid-main': {
              borderRadius: 8,
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: alpha(brandRed, 0.05),
              borderBottom: `1px solid ${alpha(ink, 0.12)}`,
              minHeight: '54px !important',
              fontSize: '1rem',
              fontWeight: 600,
              color: ink,
            },
            '& .MuiDataGrid-columnHeader': {
              outline: 'none !important',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 600,
            },
            '& .MuiDataGrid-cell': {
              fontSize: '1rem',
              borderBottomColor: alpha(ink, 0.065),
              outline: 'none !important',
              alignContent: 'center',
            },
            '& .MuiDataGrid-row': {
              transition: 'background-color 130ms ease',
            },
            '& .MuiDataGrid-row:nth-of-type(even)': {
              backgroundColor: alpha(paperStrong, 0.3),
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: `${alpha(brandRed, 0.065)} !important`,
            },
            '& .MuiDataGrid-row.Mui-selected': {
              backgroundColor: `${alpha(brandRed, 0.1)} !important`,
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${alpha(ink, 0.1)}`,
              backgroundColor: alpha(paperStrong, 0.55),
              minHeight: 48,
            },
            '& .MuiDataGrid-toolbarContainer': {
              gap: 8,
              padding: '10px 12px',
              borderBottom: `1px solid ${alpha(ink, 0.08)}`,
              backgroundColor: alpha(paperStrong, 0.72),
            },
            '& .MuiDataGrid-virtualScroller': {
              backgroundColor: alpha(paperStrong, 0.48),
            },
            '& .MuiCheckbox-root': {
              padding: 6,
            },
          },
          columnHeader: {
            textAlign: 'right',
          },
          cell: {
            textAlign: 'right',
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRadius: 0,
            borderInlineStart: `1px solid ${alpha(ink, 0.08)}`,
            borderInlineEnd: 0,
            backgroundImage: 'none',
            backgroundColor: '#fbfbf9',
            color: ink,
            boxShadow: 'none',
            '& .MuiTypography-root': {
              color: 'inherit',
            },
            '& .MuiSvgIcon-root': {
              color: 'inherit',
            },
            '& .MuiList-root': {
              paddingBlock: 8,
            },
            '& .MuiListItemIcon-root': {
              color: muted,
              minWidth: 38,
            },
            '& .MuiListItemText-primary': {
              color: ink,
              fontWeight: 600,
            },
            '& .MuiListItemText-secondary': {
              color: muted,
            },
            '& .MuiCollapse-root .MuiListItemButton-root': {
              color: ink,
            },
          },
        },
      },

      MuiListItemIcon: {
        styleOverrides: {
          root: {
            color: 'inherit',
          },
        },
      },

      MuiListItemText: {
        styleOverrides: {
          primary: {
            fontWeight: 600,
          },
        },
      },

      MuiListSubheader: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
            color: muted,
            fontWeight: 600,
            fontSize: '0.74rem',
            lineHeight: 2.5,
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            marginInline: 8,
            marginBlock: 2,
            minHeight: 42,
            color: ink,
            '&.Mui-selected': {
              backgroundColor: alpha(brandRed, 0.08),
              color: brandRedDark,
              boxShadow: `inset -3px 0 0 ${brandRed}`,
              '&:hover': {
                backgroundColor: alpha(brandRed, 0.12),
              },
            },
            '&:hover': {
              backgroundColor: alpha(ink, 0.04),
            },
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: paper,
            backgroundImage: 'none',
            color: ink,
            boxShadow: 'none',
            borderBottom: `1px solid ${alpha(ink, 0.09)}`,
          },
        },
      },

      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: '68px !important',
          },
        },
      },
    },
  },
  heIL
);
