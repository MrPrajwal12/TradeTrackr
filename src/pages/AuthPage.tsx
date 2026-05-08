import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { toast } from 'sonner'
import { Zap, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { supabase } from '@/lib/supabase'

const authSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type AuthForm = z.infer<typeof authSchema>

const otpRequestSchema = z.object({
  email: z.string().email('Invalid email'),
})

type OtpRequestForm = z.infer<typeof otpRequestSchema>

export function AuthPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [signInMethod, setSignInMethod] = useState<'otp' | 'password'>('otp')
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request')
  const [otpEmail, setOtpEmail] = useState<string>('')
  const [otpCode, setOtpCode] = useState<string>('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
  })

  const {
    register: registerOtp,
    handleSubmit: handleSubmitOtp,
    formState: { errors: otpErrors },
    getValues: getOtpValues,
  } = useForm<OtpRequestForm>({
    resolver: zodResolver(otpRequestSchema),
  })

  const redirectTo = useMemo(() => `${window.location.origin}/dashboard`, [])

  const handleSignIn = async (data: AuthForm) => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword(data)
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      navigate('/dashboard')
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })
    setLoading(false)
    if (error) toast.error(error.message)
  }

  const handleOtpRequest = async (data: OtpRequestForm) => {
    setLoading(true)
    setOtpEmail(data.email)
    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setOtpStep('verify')
    setOtpCode('')
    toast.success('OTP sent. Check your email inbox.')
  }

  const handleOtpVerify = async () => {
    if (!otpEmail) {
      toast.error('Please enter your email first.')
      setOtpStep('request')
      return
    }
    if (otpCode.replace(/\s/g, '').length < 6) {
      toast.error('Please enter the 6-digit code.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otpCode.replace(/\s/g, ''),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    navigate('/dashboard')
  }

  const handleSignUp = async (data: AuthForm) => {
    setLoading(true)
    const { data: authData, error } = await supabase.auth.signUp(data)
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else if (authData.user) {
      // Create profile safely (handles races with auto-create)
      await supabase.from('profiles').upsert({
        id: authData.user.id,
        full_name: '',
        currency: 'INR',
        starting_capital: 4184,
        monthly_target: 20920,
        max_daily_loss: 1255.2,
        onboarding_completed: false,
      }, { onConflict: 'id' })
      toast.success('Account created! Let\'s set up your profile.')
      navigate('/onboarding')
    }
  }

  return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        {/* Back button */}
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate('/')}>
          <ArrowLeft className="size-4 mr-2" /> Back to home
        </Button>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">TradeTrackr</h1>
            <p className="text-xs text-muted-foreground">Personal Finance + Trading</p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                  >
                    Continue with Google
                  </Button>
                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <Separator className="flex-1" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                    <Button
                      type="button"
                      variant={signInMethod === 'otp' ? 'default' : 'ghost'}
                      className="h-9"
                      onClick={() => {
                        setSignInMethod('otp')
                        setOtpStep('request')
                        setOtpCode('')
                      }}
                      disabled={loading}
                    >
                      OTP
                    </Button>
                    <Button
                      type="button"
                      variant={signInMethod === 'password' ? 'default' : 'ghost'}
                      className="h-9"
                      onClick={() => setSignInMethod('password')}
                      disabled={loading}
                    >
                      Password
                    </Button>
                  </div>

                  {signInMethod === 'otp' ? (
                    <div className="space-y-4">
                      {otpStep === 'request' ? (
                        <form onSubmit={handleSubmitOtp(handleOtpRequest)} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="otp-email">Email</Label>
                            <Input
                              id="otp-email"
                              type="email"
                              placeholder="you@example.com"
                              {...registerOtp('email')}
                              aria-invalid={!!otpErrors.email}
                            />
                            {otpErrors.email && (
                              <p className="text-xs text-destructive">{otpErrors.email.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              We’ll email you a one-time code. New accounts must use Sign Up.
                            </p>
                          </div>
                          <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Sending OTP...' : 'Send OTP'}
                          </Button>
                        </form>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Enter the 6-digit code</p>
                            <p className="text-xs text-muted-foreground">
                              Sent to <span className="font-medium text-foreground">{otpEmail}</span>
                            </p>
                          </div>
                          <InputOTP
                            maxLength={6}
                            value={otpCode}
                            onChange={setOtpCode}
                            disabled={loading}
                          >
                            <InputOTPGroup>
                              <InputOTPSlot index={0} />
                              <InputOTPSlot index={1} />
                              <InputOTPSlot index={2} />
                              <InputOTPSlot index={3} />
                              <InputOTPSlot index={4} />
                              <InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setOtpStep('request')
                                setOtpEmail(getOtpValues('email') || otpEmail)
                              }}
                              disabled={loading}
                            >
                              Change email
                            </Button>
                            <Button
                              type="button"
                              className="flex-1"
                              onClick={handleOtpVerify}
                              disabled={loading}
                            >
                              {loading ? 'Verifying...' : 'Verify & Sign In'}
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => handleOtpRequest({ email: otpEmail })}
                            disabled={loading || !otpEmail}
                          >
                            Resend code
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit(handleSignIn)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signin-email">Email</Label>
                        <Input
                          id="signin-email"
                          type="email"
                          placeholder="you@example.com"
                          {...register('email')}
                          aria-invalid={!!errors.email}
                        />
                        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signin-password">Password</Label>
                        <div className="relative">
                          <Input
                            id="signin-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            {...register('password')}
                            aria-invalid={!!errors.password}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                      </Button>
                    </form>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSubmit(handleSignUp)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      {...register('email')}
                      aria-invalid={!!errors.email}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="At least 6 characters"
                        {...register('password')}
                        aria-invalid={!!errors.password}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-4">
              <Separator className="my-4" />
              <p className="text-xs text-center text-muted-foreground">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
