import { DashboardStats } from '../components/DashboardStats'
import { ExpensesByProjectChart } from '../components/ExpensesByProjectChart'
import { OrdersByWeekChart } from '../components/OrdersByWeekChart'
import { PageHeader } from '../components/PageHeader'
import { useDashboardData } from '../hooks/useDashboardData'

export function DashboardPage() {
  const { summary, expenses, weeklyOrders, loadSummary, loadExpenses, loadWeeklyOrders } = useDashboardData()
  return <><PageHeader title="Dashboard" subtitle="Visão geral da oficina"/><DashboardStats state={summary} onRetry={()=>void loadSummary()}/><section className="dashboard-grid"><ExpensesByProjectChart state={expenses} onRetry={()=>void loadExpenses()}/><OrdersByWeekChart state={weeklyOrders} onRetry={()=>void loadWeeklyOrders()}/></section></>
}