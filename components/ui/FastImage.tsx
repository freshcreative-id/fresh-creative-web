'use client'

import React from 'react'

type FastImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean
}

const FastImage = React.forwardRef<HTMLImageElement, FastImageProps>(function FastImage(
  { priority = false, loading, fetchPriority, decoding, ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      {...props}
      alt={props.alt ?? ''}
      loading={loading ?? (priority ? 'eager' : 'lazy')}
      fetchPriority={fetchPriority ?? (priority ? 'high' : 'auto')}
      decoding={decoding ?? 'async'}
    />
  )
})

export default FastImage






