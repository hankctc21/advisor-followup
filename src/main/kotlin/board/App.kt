package board

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.core.userdetails.User
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder

@SpringBootApplication
@EnableScheduling
class App
fun main(args: Array<String>) { runApplication<App>(*args) }

@Configuration
@ConditionalOnWebApplication
class Security {
    @Bean fun accounts(): InMemoryUserDetailsManager {
        val encoder = BCryptPasswordEncoder()
        fun user(name: String, variable: String) = User.withUsername(name)
            .password("{bcrypt}" + encoder.encode(requireNotNull(System.getenv(variable))))
            .roles("ADVISOR").build()
        return InMemoryUserDetailsManager(user("advisor-a","ADVISOR_PASSWORD"),user("advisor-b","SECOND_PASSWORD"))
    }
    @Bean fun chain(http: HttpSecurity): SecurityFilterChain = http
        .csrf { it.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
            .csrfTokenRequestHandler(CsrfTokenRequestAttributeHandler()) }
        .authorizeHttpRequests { it.anyRequest().authenticated() }.httpBasic { }.build()
}
