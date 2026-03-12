import { clsx } from "clsx"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={clsx("animate-pulse bg-gray-200 rounded-lg", className)} />
  )
}

export function JobCardSkeleton() {
  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="card text-center">
      <Skeleton className="w-20 h-20 rounded-full mx-auto mb-3" />
      <Skeleton className="h-6 w-32 mx-auto mb-2" />
      <Skeleton className="h-4 w-48 mx-auto" />
    </div>
  )
}

export function ApplicationSkeleton() {
  return (
    <div className="card flex items-center justify-between">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full ml-3" />
    </div>
  )
}
