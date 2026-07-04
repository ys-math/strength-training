import { useCallback, useEffect, useState } from 'react'
import type { LiftKey } from '../lib/types'
import { GOALS_STORAGE_KEY, parseGoals, type GoalHorizon, type GoalMap } from '../lib/goals'

function readInitialGoals(): GoalMap {
  return parseGoals(localStorage.getItem(GOALS_STORAGE_KEY))
}

export function useGoals() {
  const [goals, setGoals] = useState<GoalMap>(readInitialGoals)

  useEffect(() => {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals))
  }, [goals])

  // Set (kg) or clear (null → fall back to the recommended value) one target.
  const setGoal = useCallback((lift: LiftKey, horizon: GoalHorizon, kg: number | null) => {
    setGoals((prev) => {
      const next: GoalMap = { ...prev, [lift]: { ...prev[lift] } }
      const byHorizon = next[lift]!
      if (kg == null || !Number.isFinite(kg) || kg <= 0) delete byHorizon[horizon]
      else byHorizon[horizon] = kg
      if (Object.keys(byHorizon).length === 0) delete next[lift]
      return next
    })
  }, [])

  const resetLift = useCallback((lift: LiftKey) => {
    setGoals((prev) => {
      if (!prev[lift]) return prev
      const next = { ...prev }
      delete next[lift]
      return next
    })
  }, [])

  return { goals, setGoal, resetLift }
}
