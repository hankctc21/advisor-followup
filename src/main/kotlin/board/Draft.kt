package board

import com.fasterxml.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.springframework.web.bind.annotation.*
import org.springframework.http.HttpStatus

data class Signals(val signals: List<String>)
val allowedSignals=setOf("서류","연락","검토","부정","조건")
@RestController
class Draft(private val json:ObjectMapper) {
    private val client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
    @PostMapping("/api/suggest")
    fun suggest(@RequestBody input:Signals):Map<String,Any> {
        if(input.signals.size>5 || input.signals.any { it !in allowedSignals }) fail(HttpStatus.BAD_REQUEST)
        val tags=input.signals.toSet()
        val permitted=buildList {
            if("부정" !in tags) {
                if("서류" in tags) add("서류 확인")
                if("연락" in tags) add("재연락")
                if("검토" in tags) add("상담 검토")
            }
        }
        val basic=mapOf("kinds" to permitted,"mode" to "규칙 초안")
        val base=System.getenv("OLLAMA_URL")?.takeIf { it.isNotBlank() } ?: return basic
        val model=System.getenv("OLLAMA_MODEL")?.takeIf { it.isNotBlank() } ?: return basic
        if(permitted.isEmpty()) return basic
        return runCatching {
            val payload=mapOf("model" to model,"stream" to false,"format" to "json",
                "prompt" to "보험 상담의 후속 업무 후보를 고른다. JSON {\u0022kinds\u0022:[...]}만 반환. 허용 후보: "+
                    permitted.joinToString()+" 입력 신호: "+tags.joinToString())
            val req=HttpRequest.newBuilder(URI.create(base.trimEnd('/')+"/api/generate"))
                .timeout(Duration.ofSeconds(12)).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build()
            val response=client.send(req,HttpResponse.BodyHandlers.ofString())
            check(response.statusCode()==200)
            val items=json.readTree(json.readTree(response.body()).path("response").asText()).path("kinds")
            check(items.isArray)
            val result=items.map { it.asText() }.distinct()
            check(result.isNotEmpty() && result.all { it in permitted })
            mapOf("kinds" to result,"mode" to "로컬 AI 초안")
        }.getOrElse { basic }
    }
}
