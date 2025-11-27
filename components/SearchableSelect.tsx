'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ChevronDown, Check } from 'lucide-react'

interface SearchableSelectProps {
  placeholder: string
  value: string
  onChange: (value: string, id?: string, logo?: string) => void
  onSearch: (query: string) => Promise<string[] | Array<{ name: string; id: string; logo?: string }>> | string[] | Array<{ name: string; id: string; logo?: string }>
  className?: string
  disabled?: boolean
  showLogo?: boolean // Whether to show logos (for team searches)
  selectedLogo?: string | null // Logo URL for the selected value
}

export default function SearchableSelect({
  placeholder,
  value,
  onChange,
  onSearch,
  className,
  disabled = false,
  showLogo = false,
  selectedLogo: externalLogo = null,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [options, setOptions] = useState<string[] | Array<{ name: string; id: string; logo?: string }>>([])
  const [internalLogo, setInternalLogo] = useState<string | null>(null)

  // Use external logo if provided, otherwise use internal state
  // Don't show logo if value is empty
  const selectedLogo = !value ? null : (externalLogo !== null ? externalLogo : internalLogo)
  const [isLoading, setIsLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Clear internal logo when value is cleared externally or when external logo is cleared
  useEffect(() => {
    if (!value) {
      setInternalLogo(null)
    }
    // Also clear if external logo is explicitly set to null
    if (externalLogo === null && internalLogo) {
      setInternalLogo(null)
    }
  }, [value, externalLogo, internalLogo])

  // Fetch options when search query changes
  useEffect(() => {
    if (!isOpen) return

    const fetchOptions = async () => {
      setIsLoading(true)
      try {
        const results = await onSearch(searchQuery)
        setOptions(results)
        setHighlightedIndex(-1)
      } catch (error) {
        console.error('Error fetching options:', error)
        setOptions([])
      } finally {
        setIsLoading(false)
      }
    }

    // Debounce search
    const timeoutId = setTimeout(fetchOptions, 600)
    return () => clearTimeout(timeoutId)
  }, [searchQuery, isOpen, onSearch])

  // Fetch initial options when opening
  useEffect(() => {
    if (isOpen && searchQuery === '') {
      const fetchInitial = async () => {
        setIsLoading(true)
        try {
          const results = await onSearch('')
          setOptions(results)
        } catch (error) {
          console.error('Error fetching initial options:', error)
          setOptions([])
        } finally {
          setIsLoading(false)
        }
      }
      fetchInitial()
    }
  }, [isOpen, onSearch])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (option: string | { name: string; id: string; logo?: string }) => {
    if (typeof option === 'string') {
      onChange(option)
      setInternalLogo(null)
    } else {
      onChange(option.name, option.id, option.logo)
      setInternalLogo(option.logo || null)
    }
    setIsOpen(false)
    setSearchQuery('')
    setHighlightedIndex(-1)
  }

  // Helper to get display value from option
  const getOptionValue = (option: string | { name: string; id: string; logo?: string }): string => {
    return typeof option === 'string' ? option : option.name
  }

  // Helper to get logo from option
  const getOptionLogo = (option: string | { name: string; id: string; logo?: string }): string | null => {
    return typeof option === 'string' ? null : (option.logo || null)
  }

  // Helper to get option for highlighting
  const getOption = (index: number): string | { name: string; id: string; logo?: string } | undefined => {
    return options[index]
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIsOpen(true)
      setHighlightedIndex((prev) =>
        prev < options.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      const option = getOption(highlightedIndex)
      if (option) handleSelect(option)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setSearchQuery('')
    }
  }

  const displayValue = value || searchQuery

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <div className="relative flex items-center">
          {showLogo && selectedLogo && (
            <img
              src={selectedLogo}
              alt=""
              className="absolute left-3 w-5 h-5 object-contain z-10"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
          <Input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsOpen(true)
              if (!e.target.value) {
                onChange('')
                setInternalLogo(null)
              }
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={`pr-8 bg-white text-gray-900 placeholder:text-gray-400 border-gray-300 ${showLogo && selectedLogo ? 'pl-10' : ''}`}
            style={{ color: '#000000' }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setIsOpen(!isOpen)
              inputRef.current?.focus()
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          disabled={disabled}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <div className="max-h-60 overflow-auto p-1">
            {isLoading ? (
              <div className="px-2 py-1.5 text-sm text-gray-500">
                Loading...
              </div>
            ) : options.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-gray-500">
                No results found
              </div>
            ) : (
              options.map((option, index) => {
                const optionValue = getOptionValue(option)
                const optionLogo = getOptionLogo(option)
                const optionKey = typeof option === 'string' ? option : `${option.id}-${option.name}`
                return (
                  <button
                    key={optionKey}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none flex items-center gap-2 text-gray-900',
                      index === highlightedIndex && 'bg-gray-100',
                      value === optionValue && 'font-medium'
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {showLogo && optionLogo && (
                      <img
                        src={optionLogo}
                        alt=""
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    )}
                    <span className="text-gray-900 flex-1">{optionValue}</span>
                    {value === optionValue && (
                      <Check className="h-4 w-4 text-gray-600 flex-shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

