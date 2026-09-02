import { useCallback, useEffect, useState } from 'react'
import { getDashboardSummary, getExpensesByProject, getOrdersByWeek } from '../services/reports'
import type { DashboardSummary, ExpensesByProject, OrdersByWeek } from '../types/reports'

export interface AsyncSection<T> {
  data: T | null
  loading: boolean
  error: boolean
}

const initialSection = <T,>(): AsyncSection<T> => ({ data: null, loading: true, error: false })

export function useDashboardData() {
  const [summary, setSummary] = useState(() => initialSection<DashboardSummary>())
  const [expenses, setExpenses] = useState(() => initialSection<ExpensesByProject[]>())
  const [weeklyOrders, setWeeklyOrders] = useState(() => initialSection<OrdersByWeek[]>())

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    setSummary((current) => ({ ...current, loading: true, error: false }))
    try {
      const data = await getDashboardSummary(signal)
      setSummary({ data, loading: false, error: false })
    } catch {
      if (!signal?.aborted) setSummary((current) => ({ ...current, loading: false, error: true }))
    }
  }, [])

  const loadExpenses = useCallback(async (signal?: AbortSignal) => {
    setExpenses((current) => ({ ...current, loading: true, error: false }))
    try {
      const data = await getExpensesByProject(signal)
      setExpenses({ data, loading: false, error: false })
    } catch {
      if (!signal?.aborted) setExpenses((current) => ({ ...current, loading: false, error: true }))
    }
  }, [])

  const loadWeeklyOrders = useCallback(async (signal?: AbortSignal) => {
    setWeeklyOrders((current) => ({ ...current, loading: true, error: false }))
    try {
      const data = await getOrdersByWeek(signal)
      setWeeklyOrders({ data, loading: false, error: false })
    } catch {
      if (!signal?.aborted) setWeeklyOrders((current) => ({ ...current, loading: false, error: true }))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getDashboardSummary(controller.signal)
      .then((data) => setSummary({ data, loading: false, error: false }))
      .catch(() => {
        if (!controller.signal.aborted) setSummary((current) => ({ ...current, loading: false, error: true }))
      })
    void getExpensesByProject(controller.signal)
      .then((data) => setExpenses({ data, loading: false, error: false }))
      .catch(() => {
        if (!controller.signal.aborted) setExpenses((current) => ({ ...current, loading: false, error: true }))
      })
    void getOrdersByWeek(controller.signal)
      .then((data) => setWeeklyOrders({ data, loading: false, error: false }))
      .catch(() => {
        if (!controller.signal.aborted) setWeeklyOrders((current) => ({ ...current, loading: false, error: true }))
      })
    return () => controller.abort()
  }, [])

  return { summary, expenses, weeklyOrders, loadSummary, loadExpenses, loadWeeklyOrders }
}