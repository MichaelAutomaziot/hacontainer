'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Alert,
  Paper,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Skeleton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  LocalShipping as ActiveShipmentsIcon,
  CheckCircle as CompletedIcon,
  Error as ErrorIcon,
  ShoppingBag as PickupIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { he } from 'date-fns/locale';
import { supabaseDataClient } from '@/utils/supabase/client';
import { hebrewTranslations } from '@/locales/he';
import { PageFrame, PageHeader } from '@/components/shared';

// Color palette for business insights
const COLORS = {
  primary: '#006d77',
  success: '#2f7d4f',
  warning: '#c77912',
  error: '#bd3f32',
  info: '#2f6ea5',
  neutral: '#6f7d78',
};

// Distinct colors for each status
const STATUS_COLORS: Record<string, string> = {
  '99': '#6f7d78',
  '21': '#2f6ea5',
  '4': '#67507a',
  '6': '#c77912',
  '3': '#2f7d4f',
  '16': '#607d8b',
  '27': '#006d77',
  '30': '#bd3f32',
  'cancelled': '#b85c38',
  '1': '#67507a',
  '2': '#7a5b55',
  '5': '#006d77',
};

interface AnalyticsData {
  totalShipments: number;
  activeShipments: number;
  completedToday: number;
  failedDeliveries: number;
  pickupReady: number;
  dailyCounts: Array<{ date: string; count: number }>;
  statusDistribution: Array<{ name: string; value: number; percentage: number }>;
  topCities: Array<{ city: string; count: number }>;
  shippingTypeBreakdown: Array<{ name: string; value: number; percentage: number }>;
}

// Cap raw-row queries — anything above this limit needs a server-side RPC.
const RAW_ROW_LIMIT = 20000;

async function fetchAnalyticsData(dateRange: number): Promise<AnalyticsData> {
  const startDate = startOfDay(subDays(new Date(), dateRange));
  const startDateISO = startDate.toISOString();
  const todayStart = startOfDay(new Date()).toISOString();

  // Fan out queries in parallel. The 4 raw-row aggregations were the heaviest
  // — `is_pickup` got replaced with two head-counts; the others get a hard
  // limit so payload stays bounded on huge ranges.
  const [
    totalShipmentsRes,
    activeShipmentsRes,
    completedTodayRes,
    failedDeliveriesRes,
    pickupReadyRes,
    pickupCountRes,
    deliveryCountRes,
    dailyDataRes,
    statusDataRes,
    cityDataRes,
  ] = await Promise.all([
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .gte('api_created_at', startDateISO),
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .gte('api_created_at', startDateISO)
      .not('status_code', 'in', '(99,3)')
      .neq('is_cancelled', true),
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .eq('status_code', '3')
      .gte('api_updated_at', todayStart),
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .gte('api_created_at', startDateISO)
      .eq('status_code', '30'),
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .gte('api_created_at', startDateISO)
      .eq('pickup_ready', true),
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .gte('api_created_at', startDateISO)
      .eq('is_pickup', true),
    supabaseDataClient
      .from('shipments')
      .select('id', { count: 'estimated', head: true })
      .gte('api_created_at', startDateISO)
      .eq('is_pickup', false),
    supabaseDataClient
      .from('shipments')
      .select('api_created_at')
      .gte('api_created_at', startDateISO)
      .order('api_created_at', { ascending: true })
      .limit(RAW_ROW_LIMIT),
    supabaseDataClient
      .from('shipments')
      .select('status_code, status_text')
      .gte('api_created_at', startDateISO)
      .limit(RAW_ROW_LIMIT),
    supabaseDataClient
      .from('shipments')
      .select('city')
      .gte('api_created_at', startDateISO)
      .order('api_created_at', { ascending: false })
      .limit(RAW_ROW_LIMIT),
  ]);

  const totalShipments = totalShipmentsRes.count;
  const activeShipments = activeShipmentsRes.count;
  const completedToday = completedTodayRes.count;
  const failedDeliveries = failedDeliveriesRes.count;
  const pickupReady = pickupReadyRes.count;
  const dailyData = dailyDataRes.data;
  const statusData = statusDataRes.data;
  const cityData = cityDataRes.data;

  // Process daily counts
  const dailyCountsMap = new Map<string, number>();
  dailyData?.forEach((item) => {
    if (item.api_created_at) {
      const date = format(new Date(item.api_created_at), 'yyyy-MM-dd');
      dailyCountsMap.set(date, (dailyCountsMap.get(date) || 0) + 1);
    }
  });

  const dailyCounts = Array.from(dailyCountsMap.entries())
    .map(([date, count]) => ({
      date: format(new Date(date), 'dd/MM', { locale: he }),
      count,
    }))
    .slice(-dateRange); // Limit to selected date range

  // Status distribution
  const statusMap = new Map<string, number>();
  statusData?.forEach((item) => {
    const status = item.status_code || 'unknown';
    statusMap.set(status, (statusMap.get(status) || 0) + 1);
  });

  const totalForPercentage = statusData?.length || 1;
  const statusDistribution = Array.from(statusMap.entries())
    .map(([status, count]) => ({
      name: hebrewTranslations.shipments.statusMap[status as keyof typeof hebrewTranslations.shipments.statusMap] || status,
      value: count,
      percentage: Math.round((count / totalForPercentage) * 100),
      statusCode: status,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Top 8 statuses

  // Top 10 cities (with normalization)
  // City name normalization mapping
  const normalizeCityName = (city: string): string | null => {
    const trimmed = city.trim();

    // Filter out pickup-related entries (not actual cities)
    const pickupKeywords = ['איסוף', 'pickup', 'עצמי'];
    if (pickupKeywords.some(keyword => trimmed.toLowerCase().includes(keyword.toLowerCase()))) {
      return null;
    }

    // Normalize common city name variations
    const cityNormalization: Record<string, string> = {
      'תל אביב': 'תל אביב - יפו',
      'תל-אביב': 'תל אביב - יפו',
      'תל אביב יפו': 'תל אביב - יפו',
      'ת"א': 'תל אביב - יפו',
      'מודיעין': 'מודיעין-מכבים-רעות',
      'מודיעין מכבים רעות': 'מודיעין-מכבים-רעות',
    };

    return cityNormalization[trimmed] || trimmed;
  };

  const cityMap = new Map<string, number>();
  cityData?.forEach((item) => {
    if (!item.city) return;
    const normalizedCity = normalizeCityName(item.city);
    if (normalizedCity) {
      cityMap.set(normalizedCity, (cityMap.get(normalizedCity) || 0) + 1);
    }
  });

  const topCities = Array.from(cityMap.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Pickup vs Regular delivery (head-count queries — no row payload)
  const pickupCount = pickupCountRes.count || 0;
  const deliveryCount = deliveryCountRes.count || 0;
  const totalShippingTypes = pickupCount + deliveryCount || 1;

  const shippingTypeBreakdown = [
    {
      name: 'איסוף',
      value: pickupCount,
      percentage: Math.round((pickupCount / totalShippingTypes) * 100),
    },
    {
      name: 'משלוח',
      value: deliveryCount,
      percentage: Math.round((deliveryCount / totalShippingTypes) * 100),
    },
  ];

  return {
    totalShipments: totalShipments || 0,
    activeShipments: activeShipments || 0,
    completedToday: completedToday || 0,
    failedDeliveries: failedDeliveries || 0,
    pickupReady: pickupReady || 0,
    dailyCounts,
    statusDistribution,
    topCities,
    shippingTypeBreakdown,
  };
}

// Metric Card Component
interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

function MetricCard({ title, value, icon, color, loading }: MetricCardProps) {
  return (
    <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            {loading ? (
              <Skeleton width={80} height={40} />
            ) : (
              <Typography variant="h4" fontWeight="bold" color={color}>
                {value.toLocaleString('he-IL')}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}20`,
              borderRadius: 2,
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: color,
        }}
      />
    </Card>
  );
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<number>(30);

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['analytics', dateRange],
    queryFn: () => fetchAnalyticsData(dateRange),
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {
    refetch();
  };

  const handleDateRangeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newRange: number | null
  ) => {
    if (newRange !== null) {
      setDateRange(newRange);
    }
  };

  // Custom tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <Paper sx={{ p: 1.5, border: 1, borderColor: 'divider' }} elevation={3}>
          <Typography variant="body2" fontWeight="bold">
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography key={index} variant="body2" color={entry.color}>
              {entry.name}: {entry.value.toLocaleString('he-IL')}
            </Typography>
          ))}
        </Paper>
      );
    }
    return null;
  };

  if (isError) {
    return (
      <PageFrame>
        <PageHeader title={hebrewTranslations.analytics.title} icon={<TrendingUpIcon />} tone="info" />
        <Alert severity="error">
          שגיאה בטעינת נתוני האנליטיקה: {error instanceof Error ? error.message : 'שגיאה לא ידועה'}
        </Alert>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageHeader
        title={hebrewTranslations.analytics.title}
        subtitle="מבט מהיר על משלוחים, איסופים, כשלים ופיזור פעילות לאורך זמן."
        icon={<TrendingUpIcon />}
        tone="info"
        actions={
          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup
            value={dateRange}
            exclusive
            onChange={handleDateRangeChange}
            size="small"
          >
            <ToggleButton value={7}>7 ימים</ToggleButton>
            <ToggleButton value={30}>30 ימים</ToggleButton>
            <ToggleButton value={90}>90 ימים</ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="רענן נתונים">
            <IconButton onClick={handleRefresh} color="primary" disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          </Box>
        }
      />

      {/* Statistics Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <MetricCard
            title={hebrewTranslations.analytics.cards.totalShipments}
            value={analytics?.totalShipments || 0}
            icon={<TrendingUpIcon sx={{ fontSize: 32, color: COLORS.primary }} />}
            color={COLORS.primary}
            loading={isLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <MetricCard
            title={hebrewTranslations.analytics.cards.activeShipments}
            value={analytics?.activeShipments || 0}
            icon={<ActiveShipmentsIcon sx={{ fontSize: 32, color: COLORS.info }} />}
            color={COLORS.info}
            loading={isLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <MetricCard
            title={hebrewTranslations.analytics.cards.completedToday}
            value={analytics?.completedToday || 0}
            icon={<CompletedIcon sx={{ fontSize: 32, color: COLORS.success }} />}
            color={COLORS.success}
            loading={isLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <MetricCard
            title={hebrewTranslations.analytics.cards.failedDeliveries}
            value={analytics?.failedDeliveries || 0}
            icon={<ErrorIcon sx={{ fontSize: 32, color: COLORS.error }} />}
            color={COLORS.error}
            loading={isLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2.4}>
          <MetricCard
            title={hebrewTranslations.analytics.cards.pickupReady}
            value={analytics?.pickupReady || 0}
            icon={<PickupIcon sx={{ fontSize: 32, color: COLORS.warning }} />}
            color={COLORS.warning}
            loading={isLoading}
          />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        {/* Shipments Over Time - Line Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                {hebrewTranslations.analytics.charts.shipmentsOverTime}
              </Typography>
              {isLoading ? (
                <Skeleton variant="rectangular" height={300} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.dailyCounts || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      reversed={true} // RTL support
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="משלוחים"
                      stroke={COLORS.primary}
                      strokeWidth={2}
                      dot={{ fill: COLORS.primary, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Pickup vs Delivery - Donut Chart */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                {hebrewTranslations.analytics.charts.shippingTypeBreakdown}
              </Typography>
              {isLoading ? (
                <Skeleton variant="circular" width={250} height={250} sx={{ mx: 'auto' }} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics?.shippingTypeBreakdown || []}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="40%"
                      innerRadius={50}
                      outerRadius={80}
                    >
                      {analytics?.shippingTypeBreakdown?.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 0 ? COLORS.warning : COLORS.primary}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{ fontSize: '12px', paddingTop: '15px' }}
                      formatter={(value, entry: any) => (
                        <span style={{ color: '#000' }}>
                          {value}: {entry.payload?.percentage}%
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Top 10 Cities - Bar Chart */}
        <Grid item xs={12} lg={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                {hebrewTranslations.analytics.charts.cityDistribution} - Top 10
              </Typography>
              {isLoading ? (
                <Skeleton variant="rectangular" height={350} />
              ) : (
                <Box sx={{ display: 'flex', height: 350 }}>
                  {/* City Labels on the right */}
                  <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-around',
                    pr: 2,
                    py: 3,
                    minWidth: 140,
                    order: 2,
                  }}>
                    {(analytics?.topCities || []).map((city, index) => (
                      <Typography
                        key={index}
                        sx={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#333',
                          textAlign: 'right',
                        }}
                      >
                        {city.city}
                      </Typography>
                    ))}
                  </Box>
                  {/* Bar Chart on the left */}
                  <Box sx={{ flex: 1, order: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics?.topCities || []}
                        layout="vertical"
                        margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 12 }}
                          reversed={true}
                          orientation="top"
                        />
                        <YAxis
                          type="category"
                          dataKey="city"
                          hide={true}
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="משלוחים" fill={COLORS.info} radius={[8, 0, 0, 8]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Status Distribution - Pie Chart (Active statuses only) */}
        <Grid item xs={12} lg={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                התפלגות סטטוסים פעילים
              </Typography>
              {isLoading ? (
                <Skeleton variant="circular" width={250} height={250} sx={{ mx: 'auto' }} />
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={(analytics?.statusDistribution || []).filter(
                        (item: any) => item.statusCode !== '99' && item.statusCode !== 'unknown'
                      )}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="40%"
                      outerRadius={85}
                      innerRadius={35}
                      paddingAngle={2}
                    >
                      {(analytics?.statusDistribution || [])
                        .filter((item: any) => item.statusCode !== '99' && item.statusCode !== 'unknown')
                        .map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={STATUS_COLORS[entry.statusCode] || COLORS.neutral}
                          />
                        ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString('he-IL')} משלוחים`,
                        name
                      ]}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{ fontSize: '11px', paddingTop: '15px', color: '#000' }}
                      formatter={(value) => <span style={{ color: '#000' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </PageFrame>
  );
}
