import { useState } from 'react'
import { Check, Clock, Users, BarChart3, Calendar, Zap, ArrowRight, Menu, X } from 'lucide-react'

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState('monthly') // monthly, semester, annual

  const pricingPlans = {
    monthly: [
      { name: 'Mensal', price: '75', period: 'mês', total: 'R$ 75/mês', discount: null, features: ['Até 50 professores', 'Sugestão de substitutos', 'Relatórios básicos', 'Suporte por email'] },
    ],
    semester: [
      { name: 'Semestral Parcelado', price: '69', period: 'mês', total: 'R$ 414 (6 meses)', discount: '~8% desconto', features: ['Até 150 professores', 'Sugestão inteligente com IA', 'Relatórios avançados', 'Horários de entrada/saída', 'Suporte prioritário'] },
      { name: 'Semestral À Vista', price: '62,50', period: 'mês', total: 'R$ 375 (6 meses)', discount: '~16% desconto', badge: 'Melhor Economia', features: ['Até 150 professores', 'Sugestão inteligente com IA', 'Relatórios avançados', 'Horários de entrada/saída', 'Suporte prioritário'] },
    ],
    annual: [
      { name: 'Anual Parcelado', price: '59', period: 'mês', total: 'R$ 708 (12 meses)', discount: '~21% desconto', features: ['Até 500 professores', 'IA avançada + análise comportamental', 'Relatórios customizáveis', 'Dashboard executivo', 'Horários dinâmicos', 'Suporte 24/7', 'Integração com SGA'] },
      { name: 'Anual À Vista', price: '52,50', period: 'mês', total: 'R$ 630 (12 meses)', discount: '~30% desconto', badge: 'Maior Economia', features: ['Até 500 professores', 'IA avançada + análise comportamental', 'Relatórios customizáveis', 'Dashboard executivo', 'Horários dinâmicos', 'Suporte 24/7', 'Integração com SGA', 'Onboarding dedicado'] },
    ],
  }

  const getPricingToShow = () => {
    if (billingCycle === 'monthly') return pricingPlans.monthly
    if (billingCycle === 'semester') return pricingPlans.semester
    return pricingPlans.annual
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header/Nav */}
      <header className="border-b border-gray-100 sticky top-0 z-50 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <span className="text-lg font-bold text-gray-900">GestãoEscolar</span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition">Recursos</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition">Preços</a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition">Como Funciona</a>
            </nav>

            <div className="hidden md:flex items-center gap-3">
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition">Entrar</button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">Começar Grátis</button>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4 border-t border-gray-100">
              <nav className="flex flex-col gap-3 py-4">
                <a href="#features" className="text-sm text-gray-600 hover:text-gray-900">Recursos</a>
                <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">Preços</a>
                <a href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900">Como Funciona</a>
              </nav>
              <div className="flex flex-col gap-2 pt-4">
                <button className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg transition">Entrar</button>
                <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg transition">Começar Grátis</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full mb-6">
            <Zap size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Sistema inteligente de substituições</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Gerencie absências e substituições com <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">inteligência</span>
          </h1>

          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
            Economia de tempo para coordenadores, justiça na distribuição de aulas para professores, e relatórios profissionais gerados automaticamente. Tudo gerenciado com inteligência.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button className="px-8 py-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 text-lg">
              Começar Grátis <ArrowRight size={20} />
            </button>
            <button className="px-8 py-4 border border-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-50 transition text-lg">
              Ver Demo
            </button>
          </div>

          {/* Hero Image Placeholder */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-gray-200 aspect-video flex items-center justify-center">
            <div className="text-center">
              <Calendar size={64} className="text-blue-200 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">Dashboard inteligente de substituições</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Como Funciona</h2>
            <p className="text-xl text-gray-600">Três passos simples para organizar suas substituições</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: 1,
                title: 'Professores se cadastram',
                desc: 'Cada professor cria seu próprio perfil com seus horários de aula, entrada e saída, áreas de expertise e formação.',
                icon: Users,
              },
              {
                step: 2,
                title: 'Sistema sugere substitutos',
                desc: 'IA analisa horários, competências e carga de trabalho para sugerir os professores mais justos e disponíveis.',
                icon: Zap,
              },
              {
                step: 3,
                title: 'Gera relatórios profissionais',
                desc: 'Relatórios automáticos de ausências, substituições e grades horárias prontos para impressão ou compartilhamento.',
                icon: BarChart3,
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.step} className="relative">
                  <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:border-blue-200 transition">
                    <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg mb-6">
                      {item.step}
                    </div>
                    <Icon size={32} className="text-blue-600 mb-4" />
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                    <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                  </div>
                  {item.step < 3 && (
                    <div className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 text-gray-300">
                      <ArrowRight size={24} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Recursos Inteligentes</h2>
            <p className="text-xl text-gray-600">Tecnologia que economiza tempo e trata todos com justiça</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {[
              {
                title: 'IA que Entende Horários',
                desc: 'O sistema recebe os horários de entrada e saída de cada professor, seus períodos de aula regular e atividades de formação. A IA analisa tudo para sugerir substituições justas.',
                icon: Clock,
                features: ['Horários dinâmicos por professor', 'Análise de disponibilidade real', 'Formação e multidisciplinares inclusos']
              },
              {
                title: 'Sugestão Justa e Inteligente',
                desc: 'Cada sugestão de substituto considera competência, carga de trabalho do mês, limite de substituições e compatibilidade com a aula.',
                icon: Users,
                features: ['Sem sobrecarga de professores', 'Distribuição equilibrada', 'Priorizando expertise']
              },
              {
                title: 'Economia de Tempo Real',
                desc: 'Coordenador economiza horas na busca por substitutos. O sistema sugere os melhores em segundos, liberando tempo para tarefas estratégicas.',
                icon: Clock,
                features: ['Sugestões em tempo real', 'Interface intuitiva', 'Menos reuniões e ligações']
              },
              {
                title: 'Relatórios Profissionais',
                desc: 'Gera automaticamente relatórios de ausências, substituições e grades horárias — simples, modernos e prontos para apresentações.',
                icon: BarChart3,
                features: ['PDF profissionais', 'Gráficos e estatísticas', 'Exporte em múltiplos formatos']
              },
              {
                title: 'Cadastro Descentralizado',
                desc: 'Cada professor mantém seus próprios dados. Sem trabalho extra para admin. Informações sempre atualizadas e confiáveis.',
                icon: Users,
                features: ['Professores gerenciam dados', 'Sem intermediários', 'Autosserviço']
              },
              {
                title: 'Grades Horárias Automatizadas',
                desc: 'Gera grades de professores e salas com um clique. Visuais, claras e prontas para publicação.',
                icon: Calendar,
                features: ['Salas e professores', 'Conflitos identificados', 'Exportação em tempo real']
              },
            ].map((feature, idx) => {
              const Icon = feature.icon
              return (
                <div key={idx} className="bg-white rounded-2xl p-8 border border-gray-100">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                    <Icon size={24} className="text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">{feature.desc}</p>
                  <ul className="space-y-2">
                    {feature.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                        <Check size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Preços Transparentes</h2>
            <p className="text-xl text-gray-600 mb-8">Escolha o plano que mais se adequa à sua escola</p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              {[
                { value: 'monthly', label: 'Mensal' },
                { value: 'semester', label: 'Semestral' },
                { value: 'annual', label: 'Anual' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBillingCycle(opt.value)}
                  className={`px-4 py-2 rounded-md font-medium transition ${
                    billingCycle === opt.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {getPricingToShow().map((plan, idx) => (
              <div
                key={idx}
                className={`rounded-2xl border transition ${
                  plan.badge
                    ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 ring-2 ring-blue-200'
                    : 'border-gray-200 bg-white hover:border-blue-200'
                }`}
              >
                {plan.badge && (
                  <div className="px-6 pt-6">
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                      {plan.badge}
                    </div>
                  </div>
                )}

                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{plan.name}</h3>

                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">R$ {plan.price}</span>
                    <span className="text-gray-600 ml-2">{plan.period}</span>
                    {plan.discount && (
                      <div className="mt-2 text-sm font-medium text-green-600">{plan.discount}</div>
                    )}
                    <div className="mt-2 text-sm text-gray-600">{plan.total}</div>
                  </div>

                  <button className={`w-full py-3 rounded-lg font-medium transition mb-6 ${
                    plan.badge
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-gray-200 text-gray-900 hover:bg-gray-50'
                  }`}>
                    Escolher Plano
                  </button>

                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                        <Check size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Teste 14 dias grátis</h3>
            <p className="text-gray-600 mb-4">Sem cartão de crédito. Acesso completo a todos os recursos.</p>
            <button className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">
              Comece Agora
            </button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-4">Pronto para simplificar suas substituições?</h2>
          <p className="text-xl text-blue-100 mb-8 leading-relaxed">
            Junte-se a coordenadores que economizam horas por semana e garantem distribuição justa de aulas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-4 bg-white text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition text-lg">
              Começar Grátis Agora
            </button>
            <button className="px-8 py-4 border-2 border-white text-white font-medium rounded-lg hover:bg-white hover:bg-opacity-10 transition text-lg">
              Agendar Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold">G</span>
                </div>
                <span className="font-bold text-white">GestãoEscolar</span>
              </div>
              <p className="text-sm">Inteligência para substituições justas e eficientes.</p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Recursos</a></li>
                <li><a href="#" className="hover:text-white transition">Preços</a></li>
                <li><a href="#" className="hover:text-white transition">Demo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Sobre</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Contato</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Privacidade</a></li>
                <li><a href="#" className="hover:text-white transition">Termos</a></li>
                <li><a href="#" className="hover:text-white transition">Cookies</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-sm">© 2024 GestãoEscolar. Todos os direitos reservados.</p>
            <div className="flex gap-6 mt-4 sm:mt-0">
              <a href="#" className="text-sm hover:text-white transition">Twitter</a>
              <a href="#" className="text-sm hover:text-white transition">LinkedIn</a>
              <a href="#" className="text-sm hover:text-white transition">Instagram</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
