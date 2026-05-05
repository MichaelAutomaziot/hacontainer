'use client';

import { useDataGrid, List } from '@refinedev/mui';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import {
  Box,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockReset as ResetPasswordIcon,
} from '@mui/icons-material';
import { useUpdate, useDelete } from '@refinedev/core';
import { hebrewTranslations } from '@/locales/he';
import { useState, useEffect } from 'react';
import { supabaseDataClient } from '@/utils/supabase/client';
import { DataPanel, FilterBar } from '@/components/shared';
import Unauthorized from '@/components/Unauthorized';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
  updated_at: string;
}

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if current user is admin
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const { data: { user } } = await supabaseDataClient.auth.getUser();
        if (user) {
          const { data: userData } = await supabaseDataClient
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

          setIsAdmin(userData?.role === 'admin');
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error checking admin access:', error);
        setIsAdmin(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAdminAccess();
  }, []);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'viewer' as 'admin' | 'editor' | 'viewer',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Reset password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  const orSearch = searchQuery.trim()
    ? { fields: ['email', 'full_name'], value: searchQuery.trim() }
    : undefined;

  const { dataGridProps, tableQueryResult } = useDataGrid<User>({
    resource: 'users',
    pagination: {
      mode: 'server',
      pageSize: 25,
    },
    sorters: {
      initial: [
        {
          field: 'created_at',
          order: 'desc',
        },
      ],
    },
    filters: {
      permanent: [
        ...(roleFilter
          ? [{ field: 'role', operator: 'eq' as const, value: roleFilter }]
          : []),
      ],
    },
    meta: orSearch ? { orSearch } : undefined,
  });

  const { mutate: updateUser } = useUpdate();
  const { mutate: deleteUser } = useDelete();

  // Open add/edit dialog
  const handleOpenDialog = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        password: '',
        full_name: user.full_name || '',
        role: user.role,
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: 'viewer',
      });
    }
    setFormError('');
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setFormError('');
  };

  // Save user (create or update)
  const handleSaveUser = async () => {
    if (!formData.email) {
      setFormError(hebrewTranslations.users.messages.emailRequired);
      return;
    }

    setFormLoading(true);
    setFormError('');

    try {
      if (editingUser) {
        // Update existing user
        updateUser(
          {
            resource: 'users',
            id: editingUser.id,
            values: {
              full_name: formData.full_name,
              role: formData.role,
              updated_at: new Date().toISOString(),
            },
          },
          {
            onSuccess: () => {
              handleCloseDialog();
              tableQueryResult?.refetch();
            },
            onError: (error) => {
              setFormError(hebrewTranslations.users.messages.updateFailed);
            },
          }
        );
      } else {
        // Create new user via Supabase Auth
        if (!formData.password || formData.password.length < 6) {
          setFormError(hebrewTranslations.users.messages.passwordRequired);
          setFormLoading(false);
          return;
        }

        const { data, error } = await supabaseDataClient.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (error) {
          setFormError(error.message);
          setFormLoading(false);
          return;
        }

        if (data.user) {
          // Update the user profile with role and name
          const { error: updateError } = await supabaseDataClient
            .from('users')
            .update({
              full_name: formData.full_name,
              role: formData.role,
            })
            .eq('id', data.user.id);

          if (updateError) {
            console.error('Error updating user profile:', updateError);
          }
        }

        handleCloseDialog();
        tableQueryResult?.refetch();
      }
    } catch (error) {
      setFormError(hebrewTranslations.users.messages.saveFailed);
    } finally {
      setFormLoading(false);
    }
  };

  // Delete user
  const handleOpenDeleteDialog = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleteLoading(true);
    try {
      deleteUser(
        {
          resource: 'users',
          id: userToDelete.id,
        },
        {
          onSuccess: () => {
            handleCloseDeleteDialog();
            tableQueryResult?.refetch();
          },
        }
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  // Reset password
  const handleOpenResetDialog = (user: User) => {
    setUserToReset(user);
    setResetSuccess(false);
    setResetError('');
    setResetDialogOpen(true);
  };

  const handleCloseResetDialog = () => {
    setResetDialogOpen(false);
    setUserToReset(null);
    setResetSuccess(false);
    setResetError('');
  };

  const handleResetPassword = async () => {
    if (!userToReset) return;

    setResetLoading(true);
    try {
      // Send password reset email
      const { error } = await supabaseDataClient.auth.resetPasswordForEmail(
        userToReset.email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) {
        console.error('Error sending reset email:', error);
        setResetError(error.message);
      } else {
        setResetSuccess(true);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'error';
      case 'editor':
        return 'primary';
      case 'viewer':
      default:
        return 'default';
    }
  };

  const columns: GridColDef<User>[] = [
    {
      field: 'email',
      headerName: hebrewTranslations.users.columns.email,
      width: 250,
      flex: 1,
      renderCell: ({ row }) => (
        <Box className="ltr-content">{row.email}</Box>
      ),
    },
    {
      field: 'full_name',
      headerName: hebrewTranslations.users.columns.fullName,
      width: 200,
      renderCell: ({ row }) => row.full_name || '-',
    },
    {
      field: 'role',
      headerName: hebrewTranslations.users.columns.role,
      width: 120,
      renderCell: ({ row }) => (
        <Chip
          label={hebrewTranslations.users.roles[row.role]}
          size="small"
          color={getRoleColor(row.role)}
          variant="outlined"
        />
      ),
    },
    {
      field: 'created_at',
      headerName: hebrewTranslations.users.columns.createdAt,
      width: 180,
      renderCell: ({ row }) => new Date(row.created_at).toLocaleDateString('he-IL'),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: hebrewTranslations.shipments.columns.actions,
      width: 150,
      getActions: ({ row }) => [
        <Tooltip key="edit" title={hebrewTranslations.actions.edit}>
          <IconButton
            size="small"
            onClick={() => handleOpenDialog(row)}
            sx={{
              color: 'grey.500',
              '&:hover': {
                color: 'primary.main',
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
              },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
        <Tooltip key="reset" title={hebrewTranslations.users.actions.resetPassword}>
          <IconButton
            size="small"
            onClick={() => handleOpenResetDialog(row)}
            sx={{
              color: 'grey.500',
              '&:hover': {
                color: 'warning.main',
                backgroundColor: 'rgba(237, 108, 2, 0.08)',
              },
            }}
          >
            <ResetPasswordIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
        <Tooltip key="delete" title={hebrewTranslations.actions.delete}>
          <IconButton
            size="small"
            onClick={() => handleOpenDeleteDialog(row)}
            sx={{
              color: 'grey.500',
              '&:hover': {
                color: 'error.main',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
              },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
      ],
    },
  ];

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Show unauthorized page if not admin
  if (!isAdmin) {
    return <Unauthorized />;
  }

  return (
    <List
      title={hebrewTranslations.users.title}
      headerButtons={() => (
        <Stack direction="row" spacing={1}>
          <Tooltip title={hebrewTranslations.actions.refresh}>
            <IconButton onClick={() => tableQueryResult?.refetch()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            {hebrewTranslations.users.actions.addUser}
          </Button>
        </Stack>
      )}
    >
      {/* Search and Filters */}
      <FilterBar sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} useFlexGap>
          <TextField
            placeholder={hebrewTranslations.users.messages.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />,
              endAdornment: searchQuery && (
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              ),
            }}
          />

          <TextField
            select
            label={hebrewTranslations.users.columns.role}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">{hebrewTranslations.shipments.filters.all}</MenuItem>
            <MenuItem value="admin">{hebrewTranslations.users.roles.admin}</MenuItem>
            <MenuItem value="editor">{hebrewTranslations.users.roles.editor}</MenuItem>
            <MenuItem value="viewer">{hebrewTranslations.users.roles.viewer}</MenuItem>
          </TextField>
        </Stack>
      </FilterBar>

      {/* DataGrid */}
      <DataPanel>
      <DataGrid
        {...dataGridProps}
        columns={columns}
        autoHeight
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
        }}
      />
      </DataPanel>

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingUser
            ? hebrewTranslations.users.actions.editUser
            : hebrewTranslations.users.actions.addUser}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label={hebrewTranslations.users.columns.email}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              fullWidth
              disabled={!!editingUser}
              dir="ltr"
            />

            {!editingUser && (
              <TextField
                label={hebrewTranslations.users.columns.password}
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                fullWidth
                helperText={hebrewTranslations.users.messages.passwordHelp}
                dir="ltr"
              />
            )}

            <TextField
              label={hebrewTranslations.users.columns.fullName}
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              fullWidth
            />

            <TextField
              select
              label={hebrewTranslations.users.columns.role}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'editor' | 'viewer' })}
              fullWidth
            >
              <MenuItem value="admin">{hebrewTranslations.users.roles.admin}</MenuItem>
              <MenuItem value="editor">{hebrewTranslations.users.roles.editor}</MenuItem>
              <MenuItem value="viewer">{hebrewTranslations.users.roles.viewer}</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{hebrewTranslations.actions.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleSaveUser}
            disabled={formLoading || !formData.email}
          >
            {hebrewTranslations.actions.save}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
        <DialogTitle>{hebrewTranslations.users.actions.deleteUser}</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            {hebrewTranslations.users.messages.deleteConfirm} <strong>{userToDelete?.email}</strong>?
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>{hebrewTranslations.actions.cancel}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteUser}
            disabled={deleteLoading}
          >
            {hebrewTranslations.actions.delete}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onClose={handleCloseResetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{hebrewTranslations.users.actions.resetPassword}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {resetSuccess ? (
              <Alert severity="success">
                {hebrewTranslations.users.messages.resetEmailSent} <strong>{userToReset?.email}</strong>
              </Alert>
            ) : (
              <>
                <Alert severity="info">
                  {hebrewTranslations.users.messages.resetInfo} <strong>{userToReset?.email}</strong>
                </Alert>
                {resetError && (
                  <Alert severity="error">{resetError}</Alert>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseResetDialog}>
            {resetSuccess ? hebrewTranslations.actions.close : hebrewTranslations.actions.cancel}
          </Button>
          {!resetSuccess && (
            <Button
              variant="contained"
              color="warning"
              onClick={handleResetPassword}
              disabled={resetLoading}
            >
              {resetLoading ? <CircularProgress size={20} /> : hebrewTranslations.users.actions.sendResetEmail}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </List>
  );
}
