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

// HaContainer brand palette — red sampled directly from the official logo (#c12026).
const ink = '#1b2422';
const muted = '#61706a';
const paper = '#fbfcf8';
const paperStrong = '#ffffff';
const canvas = '#f3f0ee';
const border = 'rgba(27, 36, 34, 0.1)';
const brandRed = '#c12026';
const brandRedDark = '#8c1820';
const brandRedLight = '#e04c4a';
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

  h1: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '2.36rem', fontWeight: 800, letterSpacing: 0 },
  h2: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '2rem', fontWeight: 800, letterSpacing: 0 },
  h3: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.76rem', fontWeight: 800, letterSpacing: 0 },
  h4: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.46rem', fontWeight: 800, letterSpacing: 0 },
  h5: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.22rem', fontWeight: 800, letterSpacing: 0 },
  h6: { fontFamily: 'Rubik, Assistant, sans-serif', fontSize: '1.03rem', fontWeight: 800, letterSpacing: 0 },
  subtitle1: { fontWeight: 800, letterSpacing: 0, lineHeight: 1.35 },
  subtitle2: { fontWeight: 800, letterSpacing: 0, lineHeight: 1.4 },
  body1: { fontSize: '1rem', lineHeight: 1.64, letterSpacing: 0 },
  body2: { fontSize: '0.91rem', lineHeight: 1.58, letterSpacing: 0 },
  caption: { fontSize: '0.78rem', lineHeight: 1.55, letterSpacing: 0 },
  overline: { fontSize: '0.73rem', fontWeight: 900, letterSpacing: 0 },
  button: { textTransform: 'none', fontWeight: 850, letterSpacing: 0 },
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
        main: brandRed,
        light: '#dd7469',
        dark: brandRedDark,
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
      '0 1px 2px rgba(27, 36, 34, 0.05), 0 1px 1px rgba(27, 36, 34, 0.04)',
      '0 8px 22px rgba(27, 36, 34, 0.07)',
      '0 14px 34px rgba(27, 36, 34, 0.09)',
      '0 18px 46px rgba(27, 36, 34, 0.11)',
      ...Array(20).fill('0 24px 64px rgba(27, 36, 34, 0.13)'),
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
          },
          body: {
            minHeight: '100%',
            color: ink,
            backgroundColor: canvas,
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
            transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, opacity 160ms ease',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: `0 10px 22px ${alpha(ink, 0.1)}`,
            },
            '&.Mui-disabled': {
              transform: 'none',
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
            // Disabled state for any contained button: keep readable contrast
            // by overriding both color and background, otherwise per-color
            // gradients below leak through and we get dark text on red.
            '&.Mui-disabled': {
              color: '#ffffff',
              backgroundImage: 'none',
              backgroundColor: alpha(ink, 0.28),
            },
          },
          containedPrimary: {
            color: '#ffffff',
            backgroundImage: `linear-gradient(135deg, ${brandRed}, ${brandRedDark})`,
            '&:hover': {
              backgroundImage: `linear-gradient(135deg, ${brandRedDark}, ${brandRed})`,
            },
          },
          containedSecondary: {
            color: '#ffffff',
            backgroundImage: `linear-gradient(135deg, ${charcoal}, #3b3535)`,
          },
          outlined: {
            borderColor: alpha(ink, 0.13),
            backgroundColor: alpha(paperStrong, 0.72),
            color: ink,
            '&:hover': {
              borderColor: alpha(brandRed, 0.38),
              backgroundColor: alpha(brandRed, 0.06),
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
            backgroundImage: `linear-gradient(180deg, ${alpha(paperStrong, 0.92)}, ${alpha(paper, 0.98)})`,
            boxShadow: '0 12px 34px rgba(27, 36, 34, 0.07)',
          },
          outlined: {
            borderColor: alpha(ink, 0.11),
            boxShadow: 'none',
            backgroundImage: `linear-gradient(180deg, ${alpha(paperStrong, 0.74)}, ${alpha(paper, 0.9)})`,
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${border}`,
            backgroundImage: `linear-gradient(180deg, ${alpha(paperStrong, 0.92)}, ${alpha(paper, 0.98)})`,
            boxShadow: '0 14px 38px rgba(27, 36, 34, 0.075)',
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
            fontWeight: 800,
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
            fontWeight: 850,
            maxWidth: '100%',
          },
          label: {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
          outlined: {
            backgroundColor: alpha(paperStrong, 0.62),
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
            transition: 'transform 160ms ease, background-color 160ms ease, color 160ms ease',
            '&:hover': {
              transform: 'translateY(-1px)',
              backgroundColor: alpha(brandRed, 0.08),
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
            fontWeight: 800,
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
            fontWeight: 850,
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
            backgroundColor: alpha(brandRed, 0.08),
            '& .MuiTableCell-root': {
              fontWeight: 900,
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
              background: `linear-gradient(180deg, ${alpha(brandRed, 0.11)}, ${alpha(paperStrong, 0.84)})`,
              borderBottom: `1px solid ${alpha(ink, 0.12)}`,
              minHeight: '48px !important',
              fontSize: '0.88rem',
              fontWeight: 900,
              color: ink,
            },
            '& .MuiDataGrid-columnHeader': {
              outline: 'none !important',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 900,
            },
            '& .MuiDataGrid-cell': {
              fontSize: '0.89rem',
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
            borderLeft: `1px solid ${alpha(paperStrong, 0.16)}`,
            borderRight: 0,
              background: [
              `linear-gradient(180deg, ${alpha('#261f20', 0.99)}, ${alpha('#171415', 0.985)})`,
              `linear-gradient(135deg, ${alpha(brandRed, 0.24)}, transparent 40%, ${alpha('#ffffff', 0.06)})`,
            ].join(','),
            color: '#f7fbf8',
            boxShadow: '-18px 0 50px rgba(20, 14, 15, 0.25)',
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
              color: 'rgba(247, 251, 248, 0.72)',
              minWidth: 38,
            },
            '& .MuiListItemText-primary': {
              color: '#f7fbf8',
              fontWeight: 850,
            },
            '& .MuiListItemText-secondary': {
              color: 'rgba(247, 251, 248, 0.62)',
            },
            '& .MuiCollapse-root .MuiListItemButton-root': {
              color: 'rgba(247, 251, 248, 0.8)',
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
            fontWeight: 850,
          },
        },
      },

      MuiListSubheader: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
            color: 'rgba(247, 251, 248, 0.58)',
            fontWeight: 900,
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
            color: 'rgba(247, 251, 248, 0.84)',
            '&.Mui-selected': {
              backgroundColor: alpha(paperStrong, 0.14),
              color: '#ffffff',
              boxShadow: `inset -3px 0 0 ${brandRed}`,
              '&:hover': {
                backgroundColor: alpha(paperStrong, 0.18),
              },
            },
            '&:hover': {
              backgroundColor: alpha(paperStrong, 0.09),
            },
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(paper, 0.86),
            color: ink,
            boxShadow: 'none',
            borderBottom: `1px solid ${alpha(ink, 0.09)}`,
            backdropFilter: 'blur(18px)',
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
